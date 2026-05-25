import type { Knex } from 'knex';

// Clinical Prontuário/Atendimento v0.1 — Sprint 4.2B-1 (ADR 0010 + ADR 0009).
//
// FIRST clinical module of the Clinic OS. Tables here hold CLINICAL data — every
// access to content (chief_complaint, anamnesis, evolution, plan, internal_note)
// is gated by `requireClinicalRole` (Sprint 4.2B-2+) and audited by
// `clinical_read_audit`. The DAOs implementing these tables are append-only on
// content (notes never UPDATE; encounters move via cancellation only). No physical
// delete is allowed in the application layer for any of these four tables.
//
// Scope of this migration: ADDITIVE ONLY — creates the 4 tables, CHECK constraints
// and indexes decided in ADR 0010 §5. It does NOT create endpoints, DAOs, services
// or seed any data. user_clinical_roles starts EMPTY: no user receives a clinical
// role implicitly; clinical role grants happen via owner-only API in 4.2B-2+.
//
// FK ON DELETE policy:
//   - clinica_id  → CASCADE (mirrors all tenant-scoped tables in the project).
//   - patient_id, attending_user_id, encounter_id, author_user_id → RESTRICT.
//     Defensive: the application NEVER physically deletes patients/users; archiving
//     uses status='archived' / users.ativo=false. RESTRICT prevents accidental
//     loss of medical-legal history at the schema layer too.
//   - professional_id, appointment_id, revises_note_id, granted_by/revoked_by →
//     SET NULL (mirrors appointments.professional_id and audit_logs evidence-
//     preservation pattern).
//   - clinical_read_audit.usuario_id / clinica_id → SET NULL (mirrors audit_logs
//     exactly: preserves audit evidence even if a user/clinic record is dropped).
//
// Naming convention:
//   - Most clinical columns use English snake_case (created_at, updated_at,
//     started_at, ended_at) consistent with appointments / clinic_professionals.
//   - clinical_read_audit uses `criado_em` instead of `created_at` to MIRROR
//     audit_logs (Sprint 1.5) — the table is the clinical-read sibling of
//     audit_logs and benefits from the same column shape for similar tooling.
export async function up(knex: Knex): Promise<void> {
  // --- clinical_encounters --------------------------------------------------
  await knex.schema.createTable('clinical_encounters', (t) => {
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
    t.uuid('attending_user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    t.uuid('professional_id')
      .nullable()
      .references('id')
      .inTable('clinic_professionals')
      .onDelete('SET NULL');
    t.uuid('appointment_id')
      .nullable()
      .references('id')
      .inTable('appointments')
      .onDelete('SET NULL');
    t.timestamp('started_at', { useTz: true }).notNullable();
    t.timestamp('ended_at', { useTz: true }).nullable();
    t.string('status', 20).notNullable().defaultTo('active');
    t.timestamp('canceled_at', { useTz: true }).nullable();
    t.uuid('canceled_by_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    // Structured cancellation reason (enum). Free-text reason is in cancel_reason_text
    // (length-bounded, never logged, never persisted to audit_logs).
    t.string('cancel_reason_code', 30).nullable();
    t.text('cancel_reason_text').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // status allowlist (defense in depth — the service also validates).
  await knex.raw(`
    ALTER TABLE clinical_encounters
    ADD CONSTRAINT clinical_encounters_status_check
    CHECK (status IN ('active','canceled'))
  `);

  // ended_at must be >= started_at when set.
  await knex.raw(`
    ALTER TABLE clinical_encounters
    ADD CONSTRAINT clinical_encounters_time_order_check
    CHECK (ended_at IS NULL OR ended_at >= started_at)
  `);

  // cancellation triplet: canceled status implies all three fields present;
  // active status implies all three absent. Prevents partially-canceled rows.
  await knex.raw(`
    ALTER TABLE clinical_encounters
    ADD CONSTRAINT clinical_encounters_cancel_consistency_check
    CHECK (
      (status = 'active' AND canceled_at IS NULL AND canceled_by_user_id IS NULL AND cancel_reason_code IS NULL)
      OR
      (status = 'canceled' AND canceled_at IS NOT NULL AND canceled_by_user_id IS NOT NULL AND cancel_reason_code IS NOT NULL)
    )
  `);

  // cancel_reason_code allowlist (only checked when present).
  await knex.raw(`
    ALTER TABLE clinical_encounters
    ADD CONSTRAINT clinical_encounters_cancel_reason_code_check
    CHECK (cancel_reason_code IS NULL OR cancel_reason_code IN ('duplicated','wrong_patient','data_error','other'))
  `);

  // cancel_reason_text bounded (200 chars). The service ALSO validates and
  // strips PII; never written to audit_logs (no column for it).
  await knex.raw(`
    ALTER TABLE clinical_encounters
    ADD CONSTRAINT clinical_encounters_cancel_reason_text_length_check
    CHECK (cancel_reason_text IS NULL OR char_length(cancel_reason_text) <= 200)
  `);

  await knex.schema.alterTable('clinical_encounters', (t) => {
    t.index(['clinica_id', 'patient_id', 'started_at'], 'idx_clinical_encounters_clinica_patient_started');
    t.index(['clinica_id', 'attending_user_id', 'started_at'], 'idx_clinical_encounters_clinica_user_started');
    t.index(['clinica_id', 'status'], 'idx_clinical_encounters_clinica_status');
  });
  // Partial index — appointment linkage only matters when set.
  await knex.raw(`
    CREATE INDEX idx_clinical_encounters_clinica_appointment
    ON clinical_encounters (clinica_id, appointment_id)
    WHERE appointment_id IS NOT NULL
  `);

  // --- clinical_encounter_notes ---------------------------------------------
  await knex.schema.createTable('clinical_encounter_notes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    // clinica_id is denormalized here for direct tenant filtering in the DAO
    // without joining through clinical_encounters on every read. Service
    // validates clinica_id matches the encounter's clinica_id on insert.
    t.uuid('clinica_id')
      .notNullable()
      .references('id')
      .inTable('clinics')
      .onDelete('CASCADE');
    t.uuid('encounter_id')
      .notNullable()
      .references('id')
      .inTable('clinical_encounters')
      .onDelete('RESTRICT');
    t.uuid('author_user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    // The 5 textual clinical fields (all OPTIONAL individually; at least one
    // MUST be filled — enforced by CHECK below + the service). Length caps
    // mirror the ADR 0010 §3.2 limits.
    t.text('chief_complaint').nullable();
    t.text('anamnesis').nullable();
    t.text('evolution').nullable();
    t.text('plan').nullable();
    // internal_note: visible ONLY to the encounter's author + dono + gestor.
    // The DAO/service must omit this column for any other reader (funcionario
    // administrativo / financeiro / admin_sistema are blocked from the endpoint
    // entirely and therefore never read this row at all).
    t.text('internal_note').nullable();
    // Rectification chain: a new note that supersedes an older one points to
    // it via revises_note_id and must carry a structured reason_code. Original
    // notes are NEVER updated; the chain preserves all versions.
    t.uuid('revises_note_id')
      .nullable()
      .references('id')
      .inTable('clinical_encounter_notes')
      .onDelete('SET NULL');
    t.string('rectification_reason_code', 30).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // At least one of the 5 textual fields must be set — a note row is content
  // by definition. Service also validates this before insert.
  await knex.raw(`
    ALTER TABLE clinical_encounter_notes
    ADD CONSTRAINT clinical_encounter_notes_has_content_check
    CHECK (
      chief_complaint IS NOT NULL
      OR anamnesis IS NOT NULL
      OR evolution IS NOT NULL
      OR plan IS NOT NULL
      OR internal_note IS NOT NULL
    )
  `);

  // Length caps (defense in depth — service caps incoming payload).
  await knex.raw(`
    ALTER TABLE clinical_encounter_notes
    ADD CONSTRAINT clinical_encounter_notes_lengths_check
    CHECK (
      (chief_complaint IS NULL OR char_length(chief_complaint) <= 2000)
      AND (anamnesis IS NULL OR char_length(anamnesis) <= 8000)
      AND (evolution IS NULL OR char_length(evolution) <= 8000)
      AND (plan IS NULL OR char_length(plan) <= 4000)
      AND (internal_note IS NULL OR char_length(internal_note) <= 2000)
    )
  `);

  // Rectification consistency: either both revises_note_id and reason_code are
  // set, or both are null. Mixing is invalid.
  await knex.raw(`
    ALTER TABLE clinical_encounter_notes
    ADD CONSTRAINT clinical_encounter_notes_rectification_consistency_check
    CHECK (
      (revises_note_id IS NULL AND rectification_reason_code IS NULL)
      OR
      (revises_note_id IS NOT NULL AND rectification_reason_code IS NOT NULL)
    )
  `);

  // rectification_reason_code allowlist (only checked when present).
  await knex.raw(`
    ALTER TABLE clinical_encounter_notes
    ADD CONSTRAINT clinical_encounter_notes_rectification_reason_code_check
    CHECK (
      rectification_reason_code IS NULL
      OR rectification_reason_code IN ('typo','clinical_correction','add_info','other')
    )
  `);

  await knex.schema.alterTable('clinical_encounter_notes', (t) => {
    t.index(['encounter_id', 'created_at'], 'idx_clinical_encounter_notes_encounter');
    t.index(['clinica_id', 'author_user_id'], 'idx_clinical_encounter_notes_clinica_author');
  });
  // Partial index — only rectification notes are interesting for chain lookups.
  await knex.raw(`
    CREATE INDEX idx_clinical_encounter_notes_revises_partial
    ON clinical_encounter_notes (revises_note_id)
    WHERE revises_note_id IS NOT NULL
  `);

  // --- clinical_read_audit --------------------------------------------------
  // Parallel to audit_logs (Sprint 1.5). Holds READ events for clinical content
  // only. Never holds the content itself — only identifiers. The DAO enforces
  // append-only (no UPDATE/DELETE). Mirrors audit_logs column shape (criado_em,
  // SET NULL on usuario_id / clinica_id) for consistency.
  await knex.schema.createTable('clinical_read_audit', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('clinica_id')
      .nullable()
      .references('id')
      .inTable('clinics')
      .onDelete('SET NULL');
    t.uuid('usuario_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    // Snapshot of the EFFECTIVE role at read time (anti-stale: if a role is
    // revoked later, the historical row preserves the role that was in force).
    // Stored as text (rather than enum) to accept future clinical roles without
    // schema change.
    t.string('papel_at_read', 40).notNullable();
    // Convention: every clinical read action MUST start with 'clinical.' so
    // queries can filter cleanly. Service-side allowlist on top of this.
    t.string('acao', 60).notNullable();
    t.string('recurso', 30).notNullable();
    t.string('recurso_id', 80).nullable();
    // paciente_id is an INTERNAL PSEUDONYMIZED IDENTIFIER (UUID) — personal
    // data under LGPD. Never logged outside this table; never paired with
    // PII (no name/CPF/phone/email/clinical content in this table). Used for
    // LGPD-art.18 transparency to the data subject (who read my chart?).
    t.uuid('paciente_id').nullable();
    t.string('request_id', 64).nullable();
    t.string('ip', 45).nullable();
    t.string('user_agent', 255).nullable();
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // acao allowlist via prefix check (any 'clinical.*' is accepted; DB enforces
  // at minimum the namespace).
  await knex.raw(`
    ALTER TABLE clinical_read_audit
    ADD CONSTRAINT clinical_read_audit_acao_prefix_check
    CHECK (acao LIKE 'clinical.%')
  `);

  // recurso allowlist.
  await knex.raw(`
    ALTER TABLE clinical_read_audit
    ADD CONSTRAINT clinical_read_audit_recurso_check
    CHECK (recurso IN ('encounter','note','timeline','document','report','attachment'))
  `);

  await knex.schema.alterTable('clinical_read_audit', (t) => {
    t.index(['clinica_id', 'criado_em'], 'idx_clinical_read_audit_clinica_criado');
    t.index(['clinica_id', 'usuario_id', 'criado_em'], 'idx_clinical_read_audit_clinica_usuario_criado');
  });
  // Partial index — LGPD-transparency queries land here (who read patient X's chart?).
  await knex.raw(`
    CREATE INDEX idx_clinical_read_audit_paciente_criado
    ON clinical_read_audit (paciente_id, criado_em)
    WHERE paciente_id IS NOT NULL
  `);

  // --- user_clinical_roles --------------------------------------------------
  // Append-only with revocation. Keeps users.papel untouched (backward-compat
  // with all auth/JWT/audit code). One ACTIVE row per (user, clinica, role)
  // enforced by partial unique index.
  await knex.schema.createTable('user_clinical_roles', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    t.uuid('clinica_id')
      .notNullable()
      .references('id')
      .inTable('clinics')
      .onDelete('CASCADE');
    // Role names parallel to users.papel but in a separate column space — the
    // current users.papel ('dono_clinica','secretaria','admin_sistema') is NOT
    // touched. New clinical roles live here only. financeiro is reserved for
    // Sprint 4.4 and is NOT in the CHECK allowlist yet.
    t.string('role', 40).notNullable();
    t.uuid('granted_by_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    t.timestamp('granted_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('revoked_at', { useTz: true }).nullable();
    t.uuid('revoked_by_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
  });

  // Role allowlist (4.2B-1 ships only the two roles needed for the Prontuário
  // v0.1; future roles ADD to this list by migration).
  await knex.raw(`
    ALTER TABLE user_clinical_roles
    ADD CONSTRAINT user_clinical_roles_role_check
    CHECK (role IN ('profissional_clinico','gestor_clinica'))
  `);

  // Revocation consistency: revoked_by_user_id may be null even when revoked_at
  // is set (the revoker user could be hard-deleted; FK SET NULL handles that).
  // What we DO enforce: revoked_at IS NULL implies revoked_by_user_id IS NULL.
  await knex.raw(`
    ALTER TABLE user_clinical_roles
    ADD CONSTRAINT user_clinical_roles_revocation_consistency_check
    CHECK (revoked_at IS NOT NULL OR revoked_by_user_id IS NULL)
  `);

  await knex.schema.alterTable('user_clinical_roles', (t) => {
    t.index(['user_id', 'clinica_id'], 'idx_user_clinical_roles_user_clinica');
  });
  // One ACTIVE row per (user, clinica, role). Revoked rows accumulate as
  // history (granted_at + revoked_at form an audit trail of the membership).
  await knex.raw(`
    CREATE UNIQUE INDEX unique_user_clinical_roles_active_partial
    ON user_clinical_roles (user_id, clinica_id, role)
    WHERE revoked_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop in reverse FK dependency order. clinical_encounter_notes references
  // clinical_encounters; clinical_read_audit and user_clinical_roles are
  // independent.
  await knex.schema.dropTableIfExists('user_clinical_roles');
  await knex.schema.dropTableIfExists('clinical_read_audit');
  await knex.schema.dropTableIfExists('clinical_encounter_notes');
  await knex.schema.dropTableIfExists('clinical_encounters');
}
