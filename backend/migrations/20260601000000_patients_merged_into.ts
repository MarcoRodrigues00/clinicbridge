import type { Knex } from 'knex';

// Safe duplicate merge B-safe (Sprint 3.33; ADR 0007). Adds provenance columns
// to patients so an archived secondary can point at the surviving primary after
// a merge. No snapshot/undo table is introduced — full reversal is out of scope.
//
// FK ON DELETE SET NULL is defensive only: there is NO physical delete of
// patients in the MVP; archiving uses status='archived'. The partial index
// keeps the new index small (only merged rows are interesting for provenance
// lookups).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('patients', (t) => {
    t.uuid('merged_into_id').nullable().references('id').inTable('patients').onDelete('SET NULL');
    t.timestamp('merged_at', { useTz: true }).nullable();
  });

  await knex.raw(
    'CREATE INDEX idx_patients_merged_into ON patients (merged_into_id) WHERE merged_into_id IS NOT NULL',
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_patients_merged_into');
  await knex.schema.alterTable('patients', (t) => {
    t.dropColumn('merged_at');
    t.dropColumn('merged_into_id');
  });
}
