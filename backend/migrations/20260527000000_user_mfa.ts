import type { Knex } from 'knex';

// MFA / TOTP fields on users (Sprint 3.19).
//
// Additive only. Existing users get mfa_enabled=false, so login is unchanged for
// them. Secrets are stored ENCRYPTED at rest (AES-256-GCM, see config/mfaCrypto).
// No clinical data. Backup codes are intentionally NOT included here (future).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.boolean('mfa_enabled').notNullable().defaultTo(false);
    // Confirmed/active TOTP secret, encrypted (base64 of iv|tag|ciphertext).
    t.text('mfa_secret_encrypted').nullable();
    // Pending secret during setup, encrypted — promoted to mfa_secret_encrypted on confirm.
    t.text('mfa_pending_secret_encrypted').nullable();
    t.timestamp('mfa_pending_created_at', { useTz: true }).nullable();
    t.timestamp('mfa_enabled_at', { useTz: true }).nullable();
    t.timestamp('mfa_last_verified_at', { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('mfa_enabled');
    t.dropColumn('mfa_secret_encrypted');
    t.dropColumn('mfa_pending_secret_encrypted');
    t.dropColumn('mfa_pending_created_at');
    t.dropColumn('mfa_enabled_at');
    t.dropColumn('mfa_last_verified_at');
  });
}
