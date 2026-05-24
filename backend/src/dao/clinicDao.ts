import type { Knex } from 'knex';
import { db } from '../config/db';
import type { ClinicRow } from '../models/clinic';

export interface CreateClinicInput {
  nome: string;
  responsavel_id: string;
  consentimento_lgpd: boolean;
  contrato_aceito_em: Date | null;
  // Normalized invite code (Sprint 3.24). Generated unique by the caller.
  invite_code: string;
}

export const clinicDao = {
  async findById(id: string, conn: Knex = db): Promise<ClinicRow | undefined> {
    return conn<ClinicRow>('clinics').where({ id }).first();
  },

  // Exact-match lookup by normalized invite code. Used only to resolve a code a
  // user already holds — there is intentionally no name search / listing.
  async findByInviteCode(code: string, conn: Knex = db): Promise<ClinicRow | undefined> {
    return conn<ClinicRow>('clinics').where({ invite_code: code }).first();
  },

  // Sprint 3.26 — owner-initiated invite-code rotation. Tenant-scoped: the
  // caller must already hold the clinic id (via requireClinic). Throws to the
  // upper layer if the unique index fires (caller retries with a fresh code).
  async updateInviteCode(
    id: string,
    newCode: string,
    conn: Knex = db,
  ): Promise<ClinicRow | undefined> {
    const [row] = await conn<ClinicRow>('clinics')
      .where({ id })
      .update({ invite_code: newCode, atualizado_em: conn.fn.now() })
      .returning('*');
    return row;
  },

  async create(input: CreateClinicInput, conn: Knex = db): Promise<ClinicRow> {
    const [row] = await conn<ClinicRow>('clinics')
      .insert({
        nome: input.nome,
        responsavel_id: input.responsavel_id,
        plano: 'free',
        consentimento_lgpd: input.consentimento_lgpd,
        contrato_aceito_em: input.contrato_aceito_em,
        invite_code: input.invite_code,
      })
      .returning('*');
    if (!row) {
      throw new Error('clinicDao.create: insert returned no row');
    }
    return row;
  },
};
