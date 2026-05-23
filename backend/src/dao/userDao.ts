import type { Knex } from 'knex';
import { db } from '../config/db';
import type { UserPapel, UserRow } from '../models/user';

export interface CreateUserInput {
  nome: string;
  email: string;
  senha_hash: string;
  papel: UserPapel;
}

export const userDao = {
  async findByEmail(email: string, conn: Knex = db): Promise<UserRow | undefined> {
    return conn<UserRow>('users').where({ email }).first();
  },

  async findById(id: string, conn: Knex = db): Promise<UserRow | undefined> {
    return conn<UserRow>('users').where({ id }).first();
  },

  async create(input: CreateUserInput, conn: Knex = db): Promise<UserRow> {
    const [row] = await conn<UserRow>('users')
      .insert({
        nome: input.nome,
        email: input.email,
        senha_hash: input.senha_hash,
        papel: input.papel,
        clinica_id: null,
        ativo: true,
      })
      .returning('*');
    if (!row) {
      throw new Error('userDao.create: insert returned no row');
    }
    return row;
  },

  async setClinic(userId: string, clinicId: string, conn: Knex = db): Promise<void> {
    await conn<UserRow>('users')
      .where({ id: userId })
      .update({ clinica_id: clinicId, atualizado_em: conn.fn.now() });
  },

  async touchLastLogin(userId: string, conn: Knex = db): Promise<void> {
    await conn<UserRow>('users')
      .where({ id: userId })
      .update({ ultimo_login_em: conn.fn.now(), atualizado_em: conn.fn.now() });
  },

  // --- MFA / TOTP (Sprint 3.19). Stores ENCRYPTED secrets only. ---

  // Stores/overwrites the pending (not-yet-confirmed) encrypted secret during setup.
  async setPendingMfaSecret(userId: string, encrypted: string, conn: Knex = db): Promise<void> {
    await conn<UserRow>('users')
      .where({ id: userId })
      .update({
        mfa_pending_secret_encrypted: encrypted,
        mfa_pending_created_at: conn.fn.now(),
        atualizado_em: conn.fn.now(),
      });
  },

  // Promotes the pending secret to active and enables MFA. Clears pending fields.
  async enableMfa(userId: string, encrypted: string, conn: Knex = db): Promise<void> {
    await conn<UserRow>('users')
      .where({ id: userId })
      .update({
        mfa_enabled: true,
        mfa_secret_encrypted: encrypted,
        mfa_enabled_at: conn.fn.now(),
        mfa_pending_secret_encrypted: null,
        mfa_pending_created_at: null,
        atualizado_em: conn.fn.now(),
      });
  },

  // Disables MFA and clears all secrets (active + pending).
  async disableMfa(userId: string, conn: Knex = db): Promise<void> {
    await conn<UserRow>('users')
      .where({ id: userId })
      .update({
        mfa_enabled: false,
        mfa_secret_encrypted: null,
        mfa_pending_secret_encrypted: null,
        mfa_pending_created_at: null,
        mfa_enabled_at: null,
        atualizado_em: conn.fn.now(),
      });
  },

  async touchMfaVerified(userId: string, conn: Knex = db): Promise<void> {
    await conn<UserRow>('users')
      .where({ id: userId })
      .update({ mfa_last_verified_at: conn.fn.now(), atualizado_em: conn.fn.now() });
  },
};
