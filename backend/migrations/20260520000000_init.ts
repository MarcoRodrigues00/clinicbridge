import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // pgcrypto for gen_random_uuid()
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  // users — clinica_id starts nullable; FK added after clinics exists
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('nome', 120).notNullable();
    t.string('email', 180).notNullable().unique();
    t.string('senha_hash', 255).notNullable();
    t.string('papel', 30).notNullable();
    t.uuid('clinica_id').nullable();
    t.boolean('ativo').notNullable().defaultTo(true);
    t.timestamp('ultimo_login_em', { useTz: true }).nullable();
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE users
    ADD CONSTRAINT users_papel_check
    CHECK (papel IN ('admin_sistema','dono_clinica','secretaria'))
  `);

  // clinics — responsavel_id is NOT NULL (every clinic must have an owner user)
  await knex.schema.createTable('clinics', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('nome', 160).notNullable();
    t.string('cnpj', 20).nullable();
    t.uuid('responsavel_id').notNullable().references('id').inTable('users');
    t.string('plano', 20).notNullable().defaultTo('free');
    t.boolean('consentimento_lgpd').notNullable().defaultTo(false);
    t.timestamp('contrato_aceito_em', { useTz: true }).nullable();
    t.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // FK users.clinica_id -> clinics.id
  await knex.schema.alterTable('users', (t) => {
    t.foreign('clinica_id').references('id').inTable('clinics');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.dropForeign('clinica_id');
  });
  await knex.schema.dropTableIfExists('clinics');
  await knex.schema.dropTableIfExists('users');
}
