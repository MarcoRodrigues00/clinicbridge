import type { Knex } from 'knex';

// MFA backup (recovery) codes — Sprint 3.21.
//
// Separate table so codes never live on the users row. Only the HASH of each code
// is stored (argon2id, see services/mfaBackupCodeService) — never the plaintext.
// Each code is single-use: used_at is stamped the first time it authenticates.
// Codes exist ONLY for users with MFA enabled; they are (re)generated on MFA
// confirm / explicit regeneration and removed when MFA is disabled. No clinical
// data; no PII. FK CASCADE so codes vanish if the user is deleted.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('user_mfa_backup_codes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    // argon2id hash of the normalized code. Salted, so two equal codes (across
    // users) would still hash differently — no unique constraint on the hash.
    t.text('code_hash').notNullable();
    t.timestamp('used_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable('user_mfa_backup_codes', (t) => {
    t.index(['user_id'], 'idx_mfa_backup_codes_user');
    // Speeds up the "unused codes for this user" lookup done at backup login.
    t.index(['user_id', 'used_at'], 'idx_mfa_backup_codes_user_used');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_mfa_backup_codes');
}
