import type { Knex } from 'knex';

// Sprint 3.25 — Team member management.
// Extends the existing clinic_join_requests.status CHECK to allow 'revoked',
// representing an owner-initiated removal of a clinic member. The vínculo atual
// (users.clinica_id) is the source of truth for the current membership; this row
// is the historical trail (who removed, when), reusing the existing audit-like
// shape of clinic_join_requests. No new table needed; no other column changes.

export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE clinic_join_requests DROP CONSTRAINT IF EXISTS cjr_status_check');
  await knex.raw(`
    ALTER TABLE clinic_join_requests
    ADD CONSTRAINT cjr_status_check
    CHECK (status IN ('pending','approved','rejected','cancelled','revoked'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Best-effort rollback: tighten the CHECK back to the original set. This will
  // fail if any 'revoked' rows already exist in the table — that's intentional;
  // the caller must clean up before downgrading.
  await knex.raw('ALTER TABLE clinic_join_requests DROP CONSTRAINT IF EXISTS cjr_status_check');
  await knex.raw(`
    ALTER TABLE clinic_join_requests
    ADD CONSTRAINT cjr_status_check
    CHECK (status IN ('pending','approved','rejected','cancelled'))
  `);
}
