import type { Knex } from 'knex';
import { db } from '../config/db';
import type {
  ClinicalEncounterNoteRow,
  ClinicalNoteRectificationReasonCode,
} from '../types/db';

// clinical_encounter_notes DAO (Sprint 4.2B-2; ADR 0010 §5.2).
//
// APPEND-ONLY. There is INTENTIONALLY NO update() or delete() method:
//   - Edition of clinical text == NEW row with revises_note_id pointing at the
//     original (ADR 0010 §9.1). The chain preserves every version.
//   - There is no physical delete of clinical content — invariant.
//
// EVERY read is tenant-scoped (clinica_id). The denormalized clinica_id column
// in clinical_encounter_notes (see migration §5.2) lets the DAO filter directly
// without joining clinical_encounters on every read. The service is responsible
// for ensuring the encounter belongs to the same clinic on insert (defense in
// depth — the DB CHECK + foreign key would catch a mismatch, but the service
// validates first for a clean 4xx).
//
// internal_note: this DAO returns the column AS-IS. Redaction for non-author
// readers happens at the SERVICE layer (clinicalEncounterNoteService) using a
// dedicated helper — never in the DAO, so internal storage is unambiguous and
// the service is the single, auditable place where the redaction decision is
// made (ADR 0010 §7 row 9).
export interface CreateClinicalEncounterNoteInput {
  clinica_id: string;
  encounter_id: string;
  author_user_id: string;
  // At least one of the 5 textual fields MUST be filled. The service validates
  // this BEFORE calling here; the DB CHECK (clinical_encounter_notes_has_content_check)
  // is a backstop, not the primary defense.
  chief_complaint: string | null;
  anamnesis: string | null;
  evolution: string | null;
  plan: string | null;
  internal_note: string | null;
  // Rectification chain — either both NULL or both NON-NULL (DB CHECK
  // enforces; service validates first).
  revises_note_id: string | null;
  rectification_reason_code: ClinicalNoteRectificationReasonCode | null;
}

export const clinicalEncounterNoteDao = {
  async create(
    input: CreateClinicalEncounterNoteInput,
    conn: Knex = db,
  ): Promise<ClinicalEncounterNoteRow> {
    const [row] = await conn<ClinicalEncounterNoteRow>('clinical_encounter_notes')
      .insert({
        clinica_id: input.clinica_id,
        encounter_id: input.encounter_id,
        author_user_id: input.author_user_id,
        chief_complaint: input.chief_complaint,
        anamnesis: input.anamnesis,
        evolution: input.evolution,
        plan: input.plan,
        internal_note: input.internal_note,
        revises_note_id: input.revises_note_id,
        rectification_reason_code: input.rectification_reason_code,
      })
      .returning('*');
    if (!row) {
      throw new Error('clinicalEncounterNoteDao.create: insert returned no row');
    }
    return row;
  },

  // Tenant-scoped + encounter-scoped fetch. Returns undefined for a cross-tenant
  // id OR a note that belongs to another encounter — callers surface a generic
  // 404 (no enumeration).
  async findByIdInEncounter(
    id: string,
    encounter_id: string,
    clinica_id: string,
    conn: Knex = db,
  ): Promise<ClinicalEncounterNoteRow | undefined> {
    return conn<ClinicalEncounterNoteRow>('clinical_encounter_notes')
      .where({ id, encounter_id, clinica_id })
      .first();
  },

  // Tenant-scoped list of notes belonging to a single encounter, in
  // chronological order. The caller is responsible for verifying the encounter
  // itself is visible to the actor before listing its notes (e.g. profissional
  // attempting to read a colleague's encounter must hit the encounter 404 first).
  async listByEncounter(
    encounter_id: string,
    clinica_id: string,
    conn: Knex = db,
  ): Promise<ClinicalEncounterNoteRow[]> {
    return conn<ClinicalEncounterNoteRow>('clinical_encounter_notes')
      .where({ encounter_id, clinica_id })
      .orderBy([
        { column: 'created_at', order: 'asc' },
        { column: 'id', order: 'asc' },
      ]);
  },
};
