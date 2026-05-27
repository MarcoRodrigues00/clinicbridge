import type { Knex } from 'knex';
import { db } from '../config/db';
import type { PatientInsuranceRow } from '../types/db';

// patient_insurances DAO — Sprint 4.7B (ADR 0016).
//
// Defense-in-depth invariants:
//   1. EVERY read and write is ALWAYS scoped by `clinica_id` (often also by
//      `patient_id` for the route-shape `/patients/:id/insurances`).
//   2. NO physical DELETE — soft-delete via `active = false`.
//   3. PII fields (`member_number`, `holder_name`) live HERE. The DAO returns
//      them raw to the service; the service decides whether to mask in the
//      response and the logger REDACTS the same field names defensively.
//   4. Multiple active rows per (patient, provider) are ALLOWED — a patient
//      can hold two cards from different plans simultaneously (e.g., titular
//      + dependent). The service enforces no other uniqueness.

export interface CreatePatientInsuranceInput {
  clinica_id: string;
  patient_id: string;
  provider_id: string;
  plan_id: string | null;
  member_number: string | null;
  holder_name: string | null;
  valid_until: string | null;
  notes: string | null;
}

export interface UpdatePatientInsuranceFields {
  provider_id?: string;
  plan_id?: string | null;
  member_number?: string | null;
  holder_name?: string | null;
  valid_until?: string | null;
  notes?: string | null;
}

export interface ListPatientInsurancesFilters {
  active?: boolean | null;
  limit: number;
  offset: number;
}

export const patientInsuranceDao = {
  async create(
    input: CreatePatientInsuranceInput,
    conn: Knex = db,
  ): Promise<PatientInsuranceRow> {
    const [row] = await conn<PatientInsuranceRow>('patient_insurances')
      .insert({
        clinica_id: input.clinica_id,
        patient_id: input.patient_id,
        provider_id: input.provider_id,
        plan_id: input.plan_id,
        member_number: input.member_number,
        holder_name: input.holder_name,
        valid_until: input.valid_until,
        notes: input.notes,
      })
      .returning('*');
    if (!row) throw new Error('patientInsuranceDao.create: insert returned no row');
    return row;
  },

  async listForPatient(
    clinica_id: string,
    patient_id: string,
    filters: ListPatientInsurancesFilters,
    conn: Knex = db,
  ): Promise<PatientInsuranceRow[]> {
    const query = conn<PatientInsuranceRow>('patient_insurances').where({
      clinica_id,
      patient_id,
    });
    if (filters.active === true || filters.active === false) {
      query.andWhere({ active: filters.active });
    }
    return query
      .orderBy('created_at', 'desc')
      .limit(filters.limit)
      .offset(filters.offset);
  },

  async findByIdForClinic(
    id: string,
    clinica_id: string,
    conn: Knex = db,
  ): Promise<PatientInsuranceRow | undefined> {
    return conn<PatientInsuranceRow>('patient_insurances')
      .where({ id, clinica_id })
      .first();
  },

  async updateForClinic(
    id: string,
    clinica_id: string,
    fields: UpdatePatientInsuranceFields,
    conn: Knex = db,
  ): Promise<PatientInsuranceRow | undefined> {
    const patch: Record<string, unknown> = { updated_at: conn.fn.now() };
    if (fields.provider_id !== undefined) patch.provider_id = fields.provider_id;
    if (fields.plan_id !== undefined) patch.plan_id = fields.plan_id;
    if (fields.member_number !== undefined) patch.member_number = fields.member_number;
    if (fields.holder_name !== undefined) patch.holder_name = fields.holder_name;
    if (fields.valid_until !== undefined) patch.valid_until = fields.valid_until;
    if (fields.notes !== undefined) patch.notes = fields.notes;

    const [row] = await conn<PatientInsuranceRow>('patient_insurances')
      .where({ id, clinica_id })
      .update(patch)
      .returning('*');
    return row;
  },

  async updateStatus(
    id: string,
    clinica_id: string,
    active: boolean,
    conn: Knex = db,
  ): Promise<PatientInsuranceRow | undefined> {
    const [row] = await conn<PatientInsuranceRow>('patient_insurances')
      .where({ id, clinica_id })
      .update({ active, updated_at: conn.fn.now() })
      .returning('*');
    return row;
  },
};
