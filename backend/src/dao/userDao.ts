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
};
