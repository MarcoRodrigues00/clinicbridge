import type { Knex } from 'knex';

// import_files — metadata for uploaded CSV/XLSX files (Sprint 2).
//
// This sprint stores ONLY the file + its metadata. Parsing, column mapping,
// migrations and patients are intentionally NOT created here.
//
// Tenant rule: clinica_id is mandatory and ON DELETE CASCADE so a clinic's raw
// uploads are removed with the clinic (LGPD right to erasure). usuario_id keeps
// the default RESTRICT — a user who owns uploads cannot be silently dropped.
//
// The internal storage filename (nome_interno) is a random UUID; the original
// name is kept only as display metadata and is never used as a filesystem path.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('import_files', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('clinica_id')
      .notNullable()
      .references('id')
      .inTable('clinics')
      .onDelete('CASCADE');
    t.uuid('usuario_id').notNullable().references('id').inTable('users');
    t.string('nome_original', 255).notNullable();
    t.string('nome_interno', 255).notNullable();
    t.string('mime_type', 120).notNullable();
    t.string('extensao', 10).notNullable();
    t.bigInteger('tamanho_bytes').notNullable();
    t.string('sha256', 64).notNullable();
    t.string('status', 40).notNullable().defaultTo('uploaded');
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable('import_files', (t) => {
    t.index(['clinica_id'], 'idx_import_files_clinica');
    t.index(['usuario_id'], 'idx_import_files_usuario');
    t.index(['sha256'], 'idx_import_files_sha256');
    t.index(['criado_em'], 'idx_import_files_criado_em');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('import_files');
}
