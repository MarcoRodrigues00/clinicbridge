import type { Knex } from 'knex';
import { db } from '../config/db';
import type {
  ClinicalDocumentCancelReasonCode,
  ClinicalDocumentRow,
  ClinicalDocumentStatus,
  ClinicalDocumentType,
} from '../types/db';

// clinical_documents DAO (Sprint 4.3B; ADR 0011).
//
// Defense-in-depth invariants enforced HERE (independent of any middleware):
//   1. EVERY read and write is ALWAYS scoped by `clinica_id`. There is no
//      `listAll()` and no `findById()` without a clinic — a missing tenant
//      filter cannot leak cross-clinic documents.
//   2. "Profissional sees only its own" is implemented as an optional
//      `author_user_id_self` parameter that the DAO ALWAYS applies when set.
//      ADR 0011 §6.3: defense lives in the DAO, not the controller — a forgotten
//      filter in the service still cannot escape the DAO.
//   3. NO physical DELETE method. ADR 0011 §2.4. `canceled` is the terminal
//      negative state.
//   4. NO update on body/title/metadata_json once status != 'draft'. The
//      `updateDraft` method's WHERE clause includes `status='draft'`, so a
//      mistaken call against a finalized row returns undefined (caller
//      surfaces as 400 `document_already_finalized` or 400 `document_canceled`).
//   5. Finalize and cancel are CAS UPDATEs requiring (id, clinica_id,
//      author=self, status pre-condition). A missed CAS surfaces a generic 404
//      at the service layer — anti-enumeration of "belongs to another
//      clinician" vs. "wrong status".
//
// SCHEMA NOTE: clinical content (body, metadata_json) lives ONLY in this row.
// No JOIN method here returns content from any other table; the PDF service
// fetches one document + reads patient/clinic for header data (administrative
// fields, not clinical content).
export interface CreateClinicalDocumentInput {
  clinica_id: string;
  patient_id: string;
  encounter_id: string | null;
  author_user_id: string;
  doc_type: ClinicalDocumentType;
  title: string;
  body: string | null;
  metadata_json: Record<string, unknown> | null;
  supersedes_document_id: string | null;
}

export interface UpdateClinicalDocumentDraftFields {
  title?: string;
  body?: string | null;
  metadata_json?: Record<string, unknown> | null;
  encounter_id?: string | null;
}

export interface ListClinicalDocumentsFilters {
  patient_id?: string | null;
  doc_type?: ClinicalDocumentType | null;
  status?: ClinicalDocumentStatus | null;
  author_user_id?: string | null;
  from?: Date | null;
  to?: Date | null;
  limit: number;
  offset: number;
  // ADR 0011 §6.3 — defense in depth. When set, ANDs `author_user_id = self`
  // to every query. Service supplies this for a profissional_clinico that is
  // NOT also dono/gestor; absence means dono/gestor scope (still tenant-bounded).
  author_user_id_self?: string | null;
}

export const clinicalDocumentDao = {
  async createDraft(
    input: CreateClinicalDocumentInput,
    conn: Knex = db,
  ): Promise<ClinicalDocumentRow> {
    const [row] = await conn<ClinicalDocumentRow>('clinical_documents')
      .insert({
        clinica_id: input.clinica_id,
        patient_id: input.patient_id,
        encounter_id: input.encounter_id,
        author_user_id: input.author_user_id,
        doc_type: input.doc_type,
        title: input.title,
        body: input.body,
        metadata_json: input.metadata_json,
        status: 'draft',
        supersedes_document_id: input.supersedes_document_id,
      })
      .returning('*');
    if (!row) {
      throw new Error('clinicalDocumentDao.createDraft: insert returned no row');
    }
    return row;
  },

  // Tenant-scoped fetch with optional self-filter. Returns undefined for a
  // cross-clinic id OR for a profissional that is not the author — caller
  // surfaces a generic 404 (no cross-tenant leak, no enumeration of "exists
  // but not yours" vs. "does not exist").
  async findByIdForClinic(
    id: string,
    clinica_id: string,
    options: { author_user_id_self?: string | null } = {},
    conn: Knex = db,
  ): Promise<ClinicalDocumentRow | undefined> {
    const query = conn<ClinicalDocumentRow>('clinical_documents').where({
      id,
      clinica_id,
    });
    if (options.author_user_id_self) {
      query.andWhere({ author_user_id: options.author_user_id_self });
    }
    return query.first();
  },

  async listForClinic(
    clinica_id: string,
    filters: ListClinicalDocumentsFilters,
    conn: Knex = db,
  ): Promise<ClinicalDocumentRow[]> {
    const query = conn<ClinicalDocumentRow>('clinical_documents').where({ clinica_id });
    if (filters.author_user_id_self) {
      // Defense in depth: ALWAYS applied when present.
      query.andWhere({ author_user_id: filters.author_user_id_self });
    }
    if (filters.patient_id) query.andWhere({ patient_id: filters.patient_id });
    if (filters.doc_type) query.andWhere({ doc_type: filters.doc_type });
    if (filters.status) query.andWhere({ status: filters.status });
    if (filters.author_user_id) query.andWhere({ author_user_id: filters.author_user_id });
    if (filters.from) query.andWhere('created_at', '>=', filters.from);
    if (filters.to) query.andWhere('created_at', '<', filters.to);
    return query
      .orderBy('created_at', 'desc')
      .limit(filters.limit)
      .offset(filters.offset);
  },

  // Tenant-scoped list for a single patient. Self-filter still applies — a
  // profissional sees only their own documents of that patient.
  async listForPatient(
    clinica_id: string,
    patient_id: string,
    options: {
      author_user_id_self?: string | null;
      limit: number;
      offset: number;
    },
    conn: Knex = db,
  ): Promise<ClinicalDocumentRow[]> {
    const query = conn<ClinicalDocumentRow>('clinical_documents').where({
      clinica_id,
      patient_id,
    });
    if (options.author_user_id_self) {
      query.andWhere({ author_user_id: options.author_user_id_self });
    }
    return query
      .orderBy('created_at', 'desc')
      .limit(options.limit)
      .offset(options.offset);
  },

  // Compare-and-set draft update. Only fields explicitly present in `patch`
  // are written. WHERE clause requires (id, clinica_id, author=self, status='draft').
  // A missed CAS surfaces as generic 404 at the service layer.
  //
  // The DAO has NO method that writes body/title/metadata_json to a non-draft
  // row. By construction, finalized/canceled documents are immutable on
  // content from this layer.
  async updateDraft(
    id: string,
    clinica_id: string,
    author_user_id: string,
    patch: UpdateClinicalDocumentDraftFields,
    conn: Knex = db,
  ): Promise<ClinicalDocumentRow | undefined> {
    const updates: Record<string, unknown> = { updated_at: conn.fn.now() };
    if (patch.title !== undefined) updates.title = patch.title;
    if (patch.body !== undefined) updates.body = patch.body;
    if (patch.metadata_json !== undefined) updates.metadata_json = patch.metadata_json;
    if (patch.encounter_id !== undefined) updates.encounter_id = patch.encounter_id;

    // No-op patches are a no-op at SQL level but still return the row (the
    // service does NOT call us when there is nothing to update; defensive
    // here: at minimum we always set updated_at).
    const [row] = await conn<ClinicalDocumentRow>('clinical_documents')
      .where({
        id,
        clinica_id,
        author_user_id,
        status: 'draft',
      })
      .update(updates)
      .returning('*');
    return row;
  },

  // Compare-and-set finalize. WHERE requires (id, clinica_id, author=self,
  // status='draft'). Sets finalized_at + finalized_by_user_id atomically.
  // The body validity (non-empty) is checked at the SERVICE before this is
  // called — DB CHECK does not enforce non-empty body in finalize because the
  // column is nullable. Service ALWAYS re-reads the row before CAS so it can
  // verify the non-empty invariant for the CURRENT row (a stale CAS without
  // re-read could finalize an outdated empty body).
  async finalize(
    id: string,
    clinica_id: string,
    author_user_id: string,
    conn: Knex = db,
  ): Promise<ClinicalDocumentRow | undefined> {
    const [row] = await conn<ClinicalDocumentRow>('clinical_documents')
      .where({
        id,
        clinica_id,
        author_user_id,
        status: 'draft',
      })
      .update({
        status: 'finalized',
        finalized_at: conn.fn.now(),
        finalized_by_user_id: author_user_id,
        updated_at: conn.fn.now(),
      })
      .returning('*');
    return row;
  },

  // Compare-and-set cancel. WHERE requires (id, clinica_id, author=self,
  // status IN ('draft','finalized')). Sets canceled_at + canceled_by_user_id
  // + cancel_reason_code + (optional) cancel_reason_text atomically.
  //
  // Note on the IN clause: Knex's .whereIn produces correct parameterized SQL.
  // A canceled document is excluded by this filter (can't double-cancel) and
  // surfaces as a generic 404 at the service.
  async cancel(
    id: string,
    clinica_id: string,
    author_user_id: string,
    cancel_reason_code: ClinicalDocumentCancelReasonCode,
    cancel_reason_text: string | null,
    conn: Knex = db,
  ): Promise<ClinicalDocumentRow | undefined> {
    const [row] = await conn<ClinicalDocumentRow>('clinical_documents')
      .where({
        id,
        clinica_id,
        author_user_id,
      })
      .whereIn('status', ['draft', 'finalized'])
      .update({
        status: 'canceled',
        canceled_at: conn.fn.now(),
        canceled_by_user_id: author_user_id,
        cancel_reason_code,
        cancel_reason_text,
        updated_at: conn.fn.now(),
      })
      .returning('*');
    return row;
  },
};
