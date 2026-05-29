import type { Knex } from 'knex';

// Clinic Governance v0.1 — Sprint 6.1A (ADR 0019).
//
// GOVERNANCE axis only (Titular / Administrador). This is ORTHOGONAL to:
//   - clinical access (user_clinical_roles, ADR 0009) — NOT touched here; being
//     an Administrador/Titular grants NO clinical access.
//   - billing/subscription (clinic_subscriptions, ADR 0018) — NOT touched here.
//
// INVARIANTS (ADR 0019):
//   - Tenant-scoped by clinica_id (mirrors every other table).
//   - Exactly ONE active `titular` per clinic (partial unique index).
//   - At most ONE active governance row per (clinica, user) (partial unique).
//   - No physical delete: revocation flips status='revoked' + revoked_at
//     (the revoke flow itself is NOT implemented this sprint — schema only).
//
// FK ON DELETE policy:
//   - clinica_id → CASCADE (governance dies with the clinic; mirrors all
//     tenant-scoped tables).
//   - user_id    → CASCADE (mirrors user_clinical_roles; the app never hard-
//     deletes users — deactivation uses users.ativo=false).
//   - created_by_user_id / revoked_by_user_id → SET NULL (preserve who acted
//     even if that user is later removed; mirrors audit evidence pattern).
//
// NAMING: English snake_case (created_at, etc.) consistent with
// user_clinical_roles / appointments / clinic_professionals.

const GOVERNANCE_ROLES = ['titular', 'administrador'] as const;
const GOVERNANCE_STATUSES = ['active', 'revoked'] as const;

function inList(values: readonly string[]): string {
  return values.map((v) => `'${v}'`).join(',');
}

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('clinic_governance_members', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('clinica_id')
      .notNullable()
      .references('id')
      .inTable('clinics')
      .onDelete('CASCADE');
    t.uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    // 'titular' = single legal owner (one active per clinic). 'administrador'
    // = partner/co-administrator with high operational power (NOT clinical).
    t.string('governance_role', 20).notNullable();
    t.string('status', 20).notNullable().defaultTo('active');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    t.timestamp('revoked_at', { useTz: true }).nullable();
    t.uuid('revoked_by_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    // Optional, length-bounded administrative reason. MUST NOT contain PII and
    // is NEVER written to audit_logs (only the action label + row id are).
    t.string('revoke_reason', 200).nullable();
  });

  // Role + status allowlists (defense in depth — the service validates too).
  await knex.raw(`
    ALTER TABLE clinic_governance_members
    ADD CONSTRAINT clinic_governance_members_role_check
    CHECK (governance_role IN (${inList(GOVERNANCE_ROLES)}))
  `);
  await knex.raw(`
    ALTER TABLE clinic_governance_members
    ADD CONSTRAINT clinic_governance_members_status_check
    CHECK (status IN (${inList(GOVERNANCE_STATUSES)}))
  `);

  // Status/revocation consistency: an active row has no revoked_at; a revoked
  // row must have revoked_at. revoked_by may still be NULL (FK SET NULL).
  await knex.raw(`
    ALTER TABLE clinic_governance_members
    ADD CONSTRAINT clinic_governance_members_revocation_consistency_check
    CHECK (
      (status = 'active'  AND revoked_at IS NULL) OR
      (status = 'revoked' AND revoked_at IS NOT NULL)
    )
  `);
  await knex.raw(`
    ALTER TABLE clinic_governance_members
    ADD CONSTRAINT clinic_governance_members_revoked_by_consistency_check
    CHECK (revoked_at IS NOT NULL OR revoked_by_user_id IS NULL)
  `);

  await knex.schema.alterTable('clinic_governance_members', (t) => {
    t.index(['clinica_id'], 'idx_clinic_governance_clinica');
    t.index(['user_id', 'clinica_id'], 'idx_clinic_governance_user_clinica');
  });

  // At most ONE active governance row per (clinica, user). Revoked rows
  // accumulate as history.
  await knex.raw(`
    CREATE UNIQUE INDEX unique_clinic_governance_active_member
    ON clinic_governance_members (clinica_id, user_id)
    WHERE status = 'active'
  `);
  // Exactly ONE active titular per clinic. Combined with the backfill below,
  // this enforces ADR 0019's "one Titular per clinic, always".
  await knex.raw(`
    CREATE UNIQUE INDEX unique_clinic_governance_active_titular
    ON clinic_governance_members (clinica_id)
    WHERE status = 'active' AND governance_role = 'titular'
  `);

  // ----- Backfill: dono_clinica → titular ------------------------------------
  // Pre-check: a clinic with MORE THAN ONE active dono_clinica would violate the
  // single-titular invariant and we refuse to guess which one is the titular.
  // Fail loudly (rolls back inside knex's per-migration transaction).
  const ambiguous = await knex('users')
    .select('clinica_id')
    .where({ papel: 'dono_clinica', ativo: true })
    .whereNotNull('clinica_id')
    .groupBy('clinica_id')
    .havingRaw('count(*) > 1');
  if (ambiguous.length > 0) {
    const ids = ambiguous.map((r) => (r as { clinica_id: string }).clinica_id).join(', ');
    throw new Error(
      `[clinic_governance_v0] Backfill aborted: clinics with >1 active dono_clinica: ${ids}. ` +
        'Resolve ownership before migrating (ADR 0019: one Titular per clinic).',
    );
  }

  // Insert one active titular per clinic for its active owner. Idempotent in dev
  // (WHERE NOT EXISTS guards a re-run). Clinics with ZERO active owner are simply
  // skipped — we never invent a titular (anomalous clinics are left untouched).
  await knex.raw(`
    INSERT INTO clinic_governance_members (clinica_id, user_id, governance_role, status, created_by_user_id)
    SELECT u.clinica_id, u.id, 'titular', 'active', NULL
    FROM users u
    WHERE u.papel = 'dono_clinica'
      AND u.ativo = true
      AND u.clinica_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM clinic_governance_members g
        WHERE g.clinica_id = u.clinica_id
          AND g.status = 'active'
          AND g.governance_role = 'titular'
      )
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('clinic_governance_members');
}
