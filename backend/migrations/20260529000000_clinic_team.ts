import crypto from 'node:crypto';
import type { Knex } from 'knex';

// Sprint 3.24 — Team management / clinic join requests.
// 1) Every clinic gets a short, opaque invite_code (owner shares it out-of-band;
//    there is intentionally NO clinic search/listing to avoid enumeration).
// 2) clinic_join_requests holds a secretaria's request to join a clinic. No
//    auto-join: the owner must approve. requested_role is constrained to
//    'secretaria' so approval can never grant 'dono_clinica'.

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no ambiguous 0/O/1/I/L
function genCode(): string {
  let out = '';
  for (let i = 0; i < 8; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out; // stored normalized (no dash); the API formats as XXXX-XXXX
}

export async function up(knex: Knex): Promise<void> {
  // --- clinics.invite_code -------------------------------------------------
  await knex.schema.alterTable('clinics', (t) => {
    t.string('invite_code', 16).nullable();
  });

  // Backfill a unique code for each existing clinic.
  const rows = await knex<{ id: string }>('clinics').select('id');
  const used = new Set<string>();
  for (const row of rows) {
    let code = genCode();
    while (used.has(code)) code = genCode();
    used.add(code);
    await knex('clinics').where({ id: row.id }).update({ invite_code: code });
  }

  await knex.schema.alterTable('clinics', (t) => {
    t.string('invite_code', 16).notNullable().alter();
    t.unique(['invite_code'], { indexName: 'clinics_invite_code_unique' });
  });

  // --- clinic_join_requests ------------------------------------------------
  await knex.schema.createTable('clinic_join_requests', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('clinic_id').notNullable().references('id').inTable('clinics').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('requested_role', 30).notNullable().defaultTo('secretaria');
    t.string('status', 20).notNullable().defaultTo('pending');
    t.uuid('decided_by_user_id').nullable().references('id').inTable('users');
    t.timestamp('decided_at', { useTz: true }).nullable();
    t.string('message', 280).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['clinic_id', 'status'], 'cjr_clinic_status_idx');
    t.index(['user_id'], 'cjr_user_idx');
  });

  await knex.raw(`
    ALTER TABLE clinic_join_requests
    ADD CONSTRAINT cjr_status_check
    CHECK (status IN ('pending','approved','rejected','cancelled'))
  `);
  // Approval can only ever grant 'secretaria' — never 'dono_clinica'/'admin_sistema'.
  await knex.raw(`
    ALTER TABLE clinic_join_requests
    ADD CONSTRAINT cjr_role_check
    CHECK (requested_role IN ('secretaria'))
  `);
  // At most one PENDING request per (user, clinic).
  await knex.raw(`
    CREATE UNIQUE INDEX cjr_unique_pending
    ON clinic_join_requests (user_id, clinic_id)
    WHERE status = 'pending'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('clinic_join_requests');
  await knex.schema.alterTable('clinics', (t) => {
    t.dropUnique(['invite_code'], 'clinics_invite_code_unique');
    t.dropColumn('invite_code');
  });
}
