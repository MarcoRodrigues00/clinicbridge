import type { Knex } from 'knex';

// Sprint 2.18 — persist the import "receipt".
//
// After a successful execution we want the UI to be able to show the summary
// (counts, when, who) even after a page reload. We attach three columns to
// import_sessions; nothing about patient values is ever stored here, only
// aggregate counts and metadata (see CLAUDE.md).
//
// imported_by_user_id is ON DELETE SET NULL so deleting a user keeps the
// session row intact (audit evidence > convenience), consistent with the
// audit_logs pattern.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('import_sessions', (t) => {
    t.jsonb('import_summary_json').nullable();
    t.timestamp('imported_at', { useTz: true }).nullable();
    t.uuid('imported_by_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
  });

  await knex.schema.alterTable('import_sessions', (t) => {
    t.index(['imported_at'], 'idx_import_sessions_imported_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('import_sessions', (t) => {
    t.dropIndex(['imported_at'], 'idx_import_sessions_imported_at');
  });
  await knex.schema.alterTable('import_sessions', (t) => {
    t.dropColumn('imported_by_user_id');
    t.dropColumn('imported_at');
    t.dropColumn('import_summary_json');
  });
}
