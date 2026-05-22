import type { Knex } from 'knex';

// patients — administrative patient data only (Sprint 2.12).
//
// IMPORTANT: this migration only CREATES the table. No rows are inserted in this
// sprint; the import is still a dry-run. Per the master doc / CLAUDE.md, the MVP
// stores ONLY administrative fields — never diagnosis, prescriptions, exams or
// any clinical data.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('patients', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('clinica_id')
      .notNullable()
      .references('id')
      .inTable('clinics')
      .onDelete('CASCADE');
    t.uuid('import_session_id')
      .nullable()
      .references('id')
      .inTable('import_sessions')
      .onDelete('SET NULL');
    t.text('nome').notNullable();
    t.text('telefone').nullable();
    t.text('email').nullable();
    t.text('cpf').nullable();
    t.date('data_nascimento').nullable();
    t.text('convenio').nullable();
    t.text('numero_carteirinha').nullable();
    t.string('status', 20).notNullable().defaultTo('active');
    t.string('origem', 20).notNullable().defaultTo('import');
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE patients
    ADD CONSTRAINT patients_status_check
    CHECK (status IN ('active','inactive','archived'))
  `);

  await knex.schema.alterTable('patients', (t) => {
    t.index(['clinica_id'], 'idx_patients_clinica');
    t.index(['import_session_id'], 'idx_patients_session');
  });

  // Partial indexes (tenant-scoped) for the dedupe lookups a future real import
  // will run. They only index non-null values to keep them small.
  await knex.raw(
    'CREATE INDEX idx_patients_clinica_cpf ON patients (clinica_id, cpf) WHERE cpf IS NOT NULL',
  );
  await knex.raw(
    'CREATE INDEX idx_patients_clinica_email ON patients (clinica_id, email) WHERE email IS NOT NULL',
  );
  await knex.raw(
    'CREATE INDEX idx_patients_clinica_telefone ON patients (clinica_id, telefone) WHERE telefone IS NOT NULL',
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('patients');
}
