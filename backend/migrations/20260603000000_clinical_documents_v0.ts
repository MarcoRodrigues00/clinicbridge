import type { Knex } from 'knex';

// Clinical Documents v0.1 — Sprint 4.3B (ADR 0011).
//
// SECOND clinical module of the Clinic OS. Reuses the existing clinical
// infrastructure introduced by Sprint 4.2B (clinical_encounters, clinical_read_audit,
// user_clinical_roles) — see ADR 0010/0011. This migration is STRICTLY ADDITIVE:
//   - 1 new table: clinical_documents
//   - 0 columns added/removed on any existing table
//   - clinical_read_audit.recurso already allows 'document' (added in 4.2B-1 §5.3
//     of ADR 0010 — defense-in-depth for this future use). No schema change here.
//
// SCHEMA INVARIANTS:
//   - clinical content (body, title, metadata_json) lives ONLY here. No JOIN
//     across tables for content reads. PDF generation reads ONE row + the
//     patient/clinic for header data — no clinical content from other tables.
//   - status state machine: draft → finalized → canceled (one-way).
//     Defended in DB by CHECK + service-level CAS in DAO updates.
//   - NO physical DELETE allowed at application layer. ADR 0011 §2.4.
//   - finalized/canceled rows are IMMUTABLE on body/title/metadata_json — the
//     DAO has no method that updates these columns when status != 'draft'.
//
// FK ON DELETE policy (mirrors clinical_encounters):
//   - clinica_id      → CASCADE   (mirrors all tenant-scoped tables).
//   - patient_id      → RESTRICT  (medical-legal history; archiving uses
//                                  status='archived' instead of DELETE).
//   - author_user_id  → RESTRICT  (preserves authorship for medical-legal evidence).
//   - encounter_id    → SET NULL  (decouple from encounter without orphaning;
//                                  matches appointments.professional_id pattern).
//   - finalized_by/canceled_by → SET NULL (audit-evidence preservation,
//                                  matches clinical_encounters.canceled_by_user_id).
//   - supersedes_document_id → SET NULL (self-ref; if an older doc becomes
//                                  inaccessible, the newer one remains usable).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('clinical_documents', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('clinica_id')
      .notNullable()
      .references('id')
      .inTable('clinics')
      .onDelete('CASCADE');
    t.uuid('patient_id')
      .notNullable()
      .references('id')
      .inTable('patients')
      .onDelete('RESTRICT');
    // Encounter linkage is OPTIONAL by design — ADR 0011 §3.5.
    // A clinic may issue an attestation/declaration without a formal encounter
    // recorded in the system (walk-in, prior consultation, etc.). When present,
    // service validates same-clinica + same-patient.
    t.uuid('encounter_id')
      .nullable()
      .references('id')
      .inTable('clinical_encounters')
      .onDelete('SET NULL');
    t.uuid('author_user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    // Document type (allowlist of 5 — ADR 0011 §3.1). Immutable after creation.
    t.string('doc_type', 30).notNullable();
    // Title is required. Service generates default ("Atestado — DD/MM/YYYY")
    // when the client omits it.
    t.string('title', 200).notNullable();
    // Body holds the clinical text content. NULL OK in draft (operator may save
    // a skeleton before filling). Service rejects finalize if body is empty.
    // 10 000 chars cap (DB CHECK + service).
    t.text('body').nullable();
    // Semi-structured per-type fields. jsonb (validated by service per doc_type;
    // no DB CHECK to keep schema flexible for template iteration). NEVER holds
    // PII fields like CPF/phone — those flow into the PDF from the patient
    // record at render time (minimization).
    t.jsonb('metadata_json').nullable();
    // Lifecycle: draft → finalized → canceled. CHECK enforces allowlist + the
    // consistency triplet (see below).
    t.string('status', 20).notNullable().defaultTo('draft');
    t.timestamp('finalized_at', { useTz: true }).nullable();
    t.uuid('finalized_by_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    t.timestamp('canceled_at', { useTz: true }).nullable();
    t.uuid('canceled_by_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    // Structured cancel reason (allowlist). Free-text cancel_reason_text is
    // length-bounded, never logged, never written to audit_logs.
    t.string('cancel_reason_code', 30).nullable();
    t.text('cancel_reason_text').nullable();
    // Self-reference: documents that replace earlier finalized documents point
    // at the predecessor via supersedes_document_id. Soft chain — DAO doesn't
    // walk it; UI surfaces "substitui o documento de DD/MM/AAAA" using this
    // single hop.
    t.uuid('supersedes_document_id')
      .nullable()
      .references('id')
      .inTable('clinical_documents')
      .onDelete('SET NULL');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // doc_type allowlist (5 types, ADR 0011 §3.1). Service ALSO validates.
  await knex.raw(`
    ALTER TABLE clinical_documents
    ADD CONSTRAINT clinical_documents_doc_type_check
    CHECK (doc_type IN ('receipt_simple','attestation','declaration','exam_request','orientation'))
  `);

  // status allowlist (defense in depth).
  await knex.raw(`
    ALTER TABLE clinical_documents
    ADD CONSTRAINT clinical_documents_status_check
    CHECK (status IN ('draft','finalized','canceled'))
  `);

  // title length cap (200 chars). Service ALSO validates at the edge.
  await knex.raw(`
    ALTER TABLE clinical_documents
    ADD CONSTRAINT clinical_documents_title_length_check
    CHECK (char_length(title) <= 200)
  `);

  // body length cap (10 000 chars). Optional column; service caps incoming payload.
  await knex.raw(`
    ALTER TABLE clinical_documents
    ADD CONSTRAINT clinical_documents_body_length_check
    CHECK (body IS NULL OR char_length(body) <= 10000)
  `);

  // cancel_reason_text length cap (200 chars).
  await knex.raw(`
    ALTER TABLE clinical_documents
    ADD CONSTRAINT clinical_documents_cancel_reason_text_length_check
    CHECK (cancel_reason_text IS NULL OR char_length(cancel_reason_text) <= 200)
  `);

  // cancel_reason_code allowlist (only checked when present).
  await knex.raw(`
    ALTER TABLE clinical_documents
    ADD CONSTRAINT clinical_documents_cancel_reason_code_check
    CHECK (cancel_reason_code IS NULL OR cancel_reason_code IN ('error','duplicate','patient_request','other'))
  `);

  // Finalized triplet: status='finalized' implies finalized_at + finalized_by_user_id
  // are both set. Cannot partially-finalize a row.
  await knex.raw(`
    ALTER TABLE clinical_documents
    ADD CONSTRAINT clinical_documents_finalized_consistency_check
    CHECK (
      status != 'finalized'
      OR (finalized_at IS NOT NULL AND finalized_by_user_id IS NOT NULL)
    )
  `);

  // Canceled triplet: status='canceled' implies all three cancel-* fields set.
  await knex.raw(`
    ALTER TABLE clinical_documents
    ADD CONSTRAINT clinical_documents_canceled_consistency_check
    CHECK (
      status != 'canceled'
      OR (canceled_at IS NOT NULL AND canceled_by_user_id IS NOT NULL AND cancel_reason_code IS NOT NULL)
    )
  `);

  // Mutual exclusion: a row cannot be both finalized and canceled at the same
  // time. A finalized doc that is later canceled keeps finalized_at as history
  // (so we know WHEN it was finalized), so this CHECK allows finalized_at to
  // remain set while status='canceled' — only the simultaneous *active* terminal
  // states are mutually exclusive (status itself, not the timestamp evidence).
  // The lifecycle constraint is implicitly enforced by the service (only
  // status='draft' transitions to 'finalized'; only 'draft'|'finalized'
  // transitions to 'canceled').

  // cancel_reason_text requires cancel_reason_code (no text without structured code).
  await knex.raw(`
    ALTER TABLE clinical_documents
    ADD CONSTRAINT clinical_documents_cancel_reason_text_requires_code_check
    CHECK (cancel_reason_text IS NULL OR cancel_reason_code IS NOT NULL)
  `);

  // Indexes (ADR 0011 §5.1 + scope doc §9.2). Tenant-first composite indexes
  // mirror the patient/encounter tables.
  await knex.schema.alterTable('clinical_documents', (t) => {
    t.index(
      ['clinica_id', 'patient_id', 'created_at'],
      'idx_clinical_documents_clinica_patient_created',
    );
    t.index(
      ['clinica_id', 'author_user_id', 'created_at'],
      'idx_clinical_documents_clinica_author_created',
    );
    t.index(
      ['clinica_id', 'status', 'created_at'],
      'idx_clinical_documents_clinica_status_created',
    );
  });

  // Partial indexes — only rows where the FK is set are interesting for these lookups.
  await knex.raw(`
    CREATE INDEX idx_clinical_documents_encounter
    ON clinical_documents (encounter_id)
    WHERE encounter_id IS NOT NULL
  `);

  await knex.raw(`
    CREATE INDEX idx_clinical_documents_supersedes
    ON clinical_documents (supersedes_document_id)
    WHERE supersedes_document_id IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Single table; no cross-table FKs added outside this migration.
  await knex.schema.dropTableIfExists('clinical_documents');
}
