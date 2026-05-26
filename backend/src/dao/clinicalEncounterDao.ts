import type { Knex } from 'knex';
import { db } from '../config/db';
import type {
  ClinicalEncounterCancelReasonCode,
  ClinicalEncounterRow,
  ClinicalEncounterStatus,
} from '../types/db';

// clinical_encounters DAO (Sprint 4.2B-2; ADR 0010 §5.1).
//
// SCHEMA INVARIANT — clinical content does NOT live in this table:
//   The 5 clinical textual fields (chief_complaint, anamnesis, evolution,
//   plan, internal_note) live exclusively in `clinical_encounter_notes`.
//   No method here ever JOINs notes; every return value carries ONLY the
//   encounter's metadata (identity, time window, status, cancellation
//   structured fields). Notes are loaded only by `clinicalEncounterNoteDao`
//   in the detail flow (`clinicalEncounterService.findById`). This makes
//   the metadata/content boundary explicit at the lowest layer: a list
//   call here CANNOT accidentally return clinical content.
//
// Defense-in-depth invariants enforced HERE (independent of any middleware):
//   1. EVERY read and write is ALWAYS scoped by `clinica_id`. There is no
//      `listAll()` and no `findById()` without a clinic — a missing tenant
//      filter cannot leak cross-clinic encounters.
//   2. "Professional sees only its own" is implemented as an optional
//      `attending_user_id_self` parameter that the DAO ALWAYS applies when
//      provided. ADR 0010 §6.1: defense must live in the DAO, not the
//      controller, so a forgotten filter in the service still cannot escape.
//   3. NO physical DELETE method. Cancellation is a status transition with a
//      CAS on attending_user_id (only the author cancels their own — see
//      cancelOwn). Restore is intentionally absent in v0.1.
//   4. NO update of clinical content here — there are no clinical text columns
//      on this table (notes live in `clinical_encounter_notes`).
export interface CreateClinicalEncounterInput {
  clinica_id: string;
  patient_id: string;
  attending_user_id: string;
  professional_id: string | null;
  appointment_id: string | null;
  started_at: Date;
  ended_at: Date | null;
}

export interface ListClinicalEncountersFilters {
  // Optional metadata filters (already validated by the service).
  patient_id?: string | null;
  professional_id?: string | null;
  attending_user_id?: string | null;
  status?: ClinicalEncounterStatus | null;
  from?: Date | null;
  to?: Date | null;
  limit: number;
  // ADR 0010 §6.1 — defense in depth. When set, the DAO ANDs
  // `attending_user_id = <value>` to every query. The service supplies this
  // for a profissional_clinico that is NOT also dono/gestor; absence means
  // dono/gestor scope (still tenant-bounded).
  attending_user_id_self?: string | null;
}

export const clinicalEncounterDao = {
  async create(
    input: CreateClinicalEncounterInput,
    conn: Knex = db,
  ): Promise<ClinicalEncounterRow> {
    const [row] = await conn<ClinicalEncounterRow>('clinical_encounters')
      .insert({
        clinica_id: input.clinica_id,
        patient_id: input.patient_id,
        attending_user_id: input.attending_user_id,
        professional_id: input.professional_id,
        appointment_id: input.appointment_id,
        started_at: input.started_at,
        ended_at: input.ended_at,
        status: 'active',
      })
      .returning('*');
    if (!row) {
      throw new Error('clinicalEncounterDao.create: insert returned no row');
    }
    return row;
  },

  // Tenant-scoped fetch with optional self-filter. Returns undefined for a
  // cross-clinic id OR for a profissional that is not the author — callers
  // surface a generic 404 (no cross-tenant leak, no enumeration of "exists
  // but not yours").
  async findByIdForClinic(
    id: string,
    clinica_id: string,
    options: { attending_user_id_self?: string | null } = {},
    conn: Knex = db,
  ): Promise<ClinicalEncounterRow | undefined> {
    const query = conn<ClinicalEncounterRow>('clinical_encounters').where({
      id,
      clinica_id,
    });
    if (options.attending_user_id_self) {
      query.andWhere({ attending_user_id: options.attending_user_id_self });
    }
    return query.first();
  },

  async listForClinic(
    clinica_id: string,
    filters: ListClinicalEncountersFilters,
    conn: Knex = db,
  ): Promise<ClinicalEncounterRow[]> {
    const query = conn<ClinicalEncounterRow>('clinical_encounters').where({ clinica_id });
    if (filters.attending_user_id_self) {
      // Defense in depth: ALWAYS applied when present. Cannot be bypassed by
      // omitting other filters.
      query.andWhere({ attending_user_id: filters.attending_user_id_self });
    }
    if (filters.patient_id) query.andWhere({ patient_id: filters.patient_id });
    if (filters.professional_id) query.andWhere({ professional_id: filters.professional_id });
    if (filters.attending_user_id) {
      query.andWhere({ attending_user_id: filters.attending_user_id });
    }
    if (filters.status) query.andWhere({ status: filters.status });
    if (filters.from) query.andWhere('started_at', '>=', filters.from);
    if (filters.to) query.andWhere('started_at', '<', filters.to);
    return query.orderBy('started_at', 'desc').limit(filters.limit);
  },

  // Tenant-scoped timeline for a single patient. Self-filter still applies —
  // a profissional sees only their own encounters with that patient (ADR
  // 0010 §10.3 + matrix §7).
  async listForPatient(
    clinica_id: string,
    patient_id: string,
    options: { attending_user_id_self?: string | null; limit: number },
    conn: Knex = db,
  ): Promise<ClinicalEncounterRow[]> {
    const query = conn<ClinicalEncounterRow>('clinical_encounters').where({
      clinica_id,
      patient_id,
    });
    if (options.attending_user_id_self) {
      query.andWhere({ attending_user_id: options.attending_user_id_self });
    }
    return query.orderBy('started_at', 'desc').limit(options.limit);
  },

  // Compare-and-set cancellation. The WHERE clause requires:
  //   - id matches AND clinica_id matches  (tenant isolation)
  //   - attending_user_id == the actor     (ADR 0010 §6.2: only the author)
  //   - status == 'active'                 (can't cancel twice; idempotency
  //                                         and anti-race-condition)
  // Returns the updated row, or undefined when the CAS missed. The service
  // treats a missed CAS as a generic 404 (anti-enumeration of "exists but
  // belongs to another clinician" or "already canceled").
  async cancelOwn(
    id: string,
    clinica_id: string,
    attending_user_id: string,
    cancel_reason_code: ClinicalEncounterCancelReasonCode,
    cancel_reason_text: string | null,
    conn: Knex = db,
  ): Promise<ClinicalEncounterRow | undefined> {
    const [row] = await conn<ClinicalEncounterRow>('clinical_encounters')
      .where({
        id,
        clinica_id,
        attending_user_id,
        status: 'active',
      })
      .update({
        status: 'canceled',
        canceled_at: conn.fn.now(),
        canceled_by_user_id: attending_user_id,
        cancel_reason_code,
        // Free-text reason: never logged, never written to audit_logs. The
        // service is responsible for length-capping and rejecting obvious
        // PII patterns at the edge.
        cancel_reason_text,
        updated_at: conn.fn.now(),
      })
      .returning('*');
    return row;
  },
};
