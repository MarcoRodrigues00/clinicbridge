import type { Knex } from 'knex';
import { db } from '../config/db';
import type { ImportFileInput, ImportFileRow } from '../models/importFile';

// import_files DAO. No update/delete in this sprint — we only register uploads
// and list them. Listing is ALWAYS scoped by clinica_id; there is intentionally
// no listAll() so a missing tenant filter can't leak cross-clinic files.
export const importFileDao = {
  async create(input: ImportFileInput, conn: Knex = db): Promise<ImportFileRow> {
    const [row] = await conn<ImportFileRow>('import_files')
      .insert({
        clinica_id: input.clinica_id,
        usuario_id: input.usuario_id,
        nome_original: input.nome_original,
        nome_interno: input.nome_interno,
        mime_type: input.mime_type,
        extensao: input.extensao,
        tamanho_bytes: input.tamanho_bytes,
        sha256: input.sha256,
        status: input.status ?? 'uploaded',
      })
      .returning('*');
    if (!row) {
      throw new Error('importFileDao.create: insert returned no row');
    }
    return row;
  },

  async listByClinic(clinica_id: string, conn: Knex = db): Promise<ImportFileRow[]> {
    return conn<ImportFileRow>('import_files')
      .where({ clinica_id })
      .orderBy('criado_em', 'desc');
  },

  // Tenant-scoped single lookup: the clinica_id filter is part of the WHERE, so
  // a file from another clinic is indistinguishable from a missing one (caller
  // returns a generic 404 — no cross-tenant enumeration).
  async findByIdForClinic(
    id: string,
    clinica_id: string,
    conn: Knex = db,
  ): Promise<ImportFileRow | undefined> {
    return conn<ImportFileRow>('import_files').where({ id, clinica_id }).first();
  },

  // Read-only retention scan (Sprint 2.24): files older than `cutoff` for one
  // clinic, oldest first, capped by `limit`. ALWAYS tenant-scoped. This only
  // READS — there is intentionally no delete here; cleanup is a future sprint.
  async listOlderThanForClinic(
    clinica_id: string,
    cutoff: Date,
    limit: number,
    conn: Knex = db,
  ): Promise<ImportFileRow[]> {
    return conn<ImportFileRow>('import_files')
      .where({ clinica_id })
      .andWhere('criado_em', '<', cutoff)
      .orderBy('criado_em', 'asc')
      .limit(limit);
  },
};
