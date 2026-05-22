import type { Knex } from 'knex';

// audit_logs — append-only event log. Per master doc section 3.2/3.4:
//   - NO ON DELETE CASCADE on usuario_id / clinica_id (preserve evidence if
//     the user/clinic is later removed; the FK becomes NULL via ON DELETE SET NULL).
//   - The DAO layer enforces append-only; there are no UPDATE/DELETE methods.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('audit_logs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('usuario_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    t.uuid('clinica_id')
      .nullable()
      .references('id')
      .inTable('clinics')
      .onDelete('SET NULL');
    t.string('acao', 60).notNullable();
    t.string('recurso', 60).nullable();
    t.string('recurso_id', 80).nullable();
    t.string('ip', 45).nullable();
    t.string('user_agent', 255).nullable();
    t.string('request_id', 64).nullable();
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Query pattern: events per clinic over a time window.
  await knex.schema.alterTable('audit_logs', (t) => {
    t.index(['clinica_id', 'criado_em'], 'idx_audit_clinica_data');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('audit_logs');
}
