import type { Knex } from 'knex';

// import_sessions — an auditable "migration review" (Sprint 2.10).
//
// It records WHICH file was reviewed, the confirmed column mapping and the
// backend-produced validation summary. It deliberately stores NO patient data:
// no rows, no cell values, no CPF/phone/email/name — only mapping, aggregate
// stats and a small issue sample (line numbers + safe labels).
//
// This is NOT the future `migrations` table from the master doc (that one drives
// the actual import). No patients/migration_errors tables are created here.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('import_sessions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('clinica_id')
      .notNullable()
      .references('id')
      .inTable('clinics')
      .onDelete('CASCADE');
    t.uuid('import_file_id')
      .notNullable()
      .references('id')
      .inTable('import_files')
      .onDelete('CASCADE');
    t.uuid('usuario_id').notNullable().references('id').inTable('users');
    t.string('status', 40).notNullable().defaultTo('validated');
    t.jsonb('mapping_json').notNullable();
    t.jsonb('validation_summary_json').notNullable();
    t.jsonb('field_stats_json').nullable();
    t.jsonb('issues_sample_json').nullable();
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE import_sessions
    ADD CONSTRAINT import_sessions_status_check
    CHECK (status IN ('validated','ready_for_import','import_started','import_completed','cancelled','failed'))
  `);

  await knex.schema.alterTable('import_sessions', (t) => {
    t.index(['clinica_id'], 'idx_import_sessions_clinica');
    t.index(['import_file_id'], 'idx_import_sessions_file');
    t.index(['criado_em'], 'idx_import_sessions_criado_em');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('import_sessions');
}
