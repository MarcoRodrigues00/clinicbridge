import type { Knex } from 'knex';
import { db } from '../config/db';
import type { UserMfaBackupCodeRow } from '../types/db';

// DAO for MFA backup codes (Sprint 3.21). Stores only argon2 HASHES; the plaintext
// code never reaches this layer's storage. Single-use is enforced by markUsed's
// compare-and-set on used_at. Scoped by user_id on every operation.
export const mfaBackupCodeDao = {
  // Replaces a user's whole code set atomically (generate + regenerate). Deletes
  // any existing codes (used or not) and inserts the new hashes. Caller should run
  // this inside a transaction together with the related users update.
  async replaceForUser(userId: string, hashes: string[], conn: Knex = db): Promise<void> {
    await conn<UserMfaBackupCodeRow>('user_mfa_backup_codes').where({ user_id: userId }).del();
    if (hashes.length > 0) {
      await conn<UserMfaBackupCodeRow>('user_mfa_backup_codes').insert(
        hashes.map((code_hash) => ({ user_id: userId, code_hash })),
      );
    }
  },

  // Removes every code for a user (used when MFA is disabled).
  async deleteForUser(userId: string, conn: Knex = db): Promise<void> {
    await conn<UserMfaBackupCodeRow>('user_mfa_backup_codes').where({ user_id: userId }).del();
  },

  // Unused codes for a user — the candidate set verified at backup login.
  async listUnusedByUser(
    userId: string,
    conn: Knex = db,
  ): Promise<Pick<UserMfaBackupCodeRow, 'id' | 'code_hash'>[]> {
    return conn<UserMfaBackupCodeRow>('user_mfa_backup_codes')
      .where({ user_id: userId })
      .whereNull('used_at')
      .select('id', 'code_hash');
  },

  // Compare-and-set: marks a single code used only if it is still unused. Returns
  // true when this call is the one that consumed it (guards against double-use
  // under concurrency). Scoped by user_id as defense in depth.
  async markUsed(id: string, userId: string, conn: Knex = db): Promise<boolean> {
    const affected = await conn<UserMfaBackupCodeRow>('user_mfa_backup_codes')
      .where({ id, user_id: userId })
      .whereNull('used_at')
      .update({ used_at: conn.fn.now() });
    return affected > 0;
  },

  async countUnusedByUser(userId: string, conn: Knex = db): Promise<number> {
    const row = await conn<UserMfaBackupCodeRow>('user_mfa_backup_codes')
      .where({ user_id: userId })
      .whereNull('used_at')
      .count<{ c: string }[]>({ c: '*' })
      .first();
    return row ? Number(row.c) : 0;
  },
};
