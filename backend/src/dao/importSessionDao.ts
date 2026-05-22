import type { Knex } from 'knex';
import { db } from '../config/db';
import type {
  CreateImportSessionInput,
  ImportSessionRow,
  ImportSessionStatus,
} from '../models/importSession';

// import_sessions DAO. Always tenant-scoped. Updates are restricted to a
// status transition (no row-level mutation of mapping/results). jsonb columns
// are stringified on insert; pg returns them parsed.
export const importSessionDao = {
  async create(input: CreateImportSessionInput, conn: Knex = db): Promise<ImportSessionRow> {
    const [row] = await conn<ImportSessionRow>('import_sessions')
      .insert({
        clinica_id: input.clinica_id,
        import_file_id: input.import_file_id,
        usuario_id: input.usuario_id,
        status: input.status,
        mapping_json: JSON.stringify(input.mapping) as unknown as ImportSessionRow['mapping_json'],
        validation_summary_json: JSON.stringify(
          input.validation_summary,
        ) as unknown as ImportSessionRow['validation_summary_json'],
        field_stats_json: JSON.stringify(
          input.field_stats,
        ) as unknown as ImportSessionRow['field_stats_json'],
        issues_sample_json: JSON.stringify(
          input.issues_sample,
        ) as unknown as ImportSessionRow['issues_sample_json'],
      })
      .returning('*');
    if (!row) {
      throw new Error('importSessionDao.create: insert returned no row');
    }
    return row;
  },

  async listByClinic(clinica_id: string, conn: Knex = db): Promise<ImportSessionRow[]> {
    return conn<ImportSessionRow>('import_sessions')
      .where({ clinica_id })
      .orderBy('criado_em', 'desc');
  },

  async findByIdForClinic(
    id: string,
    clinica_id: string,
    conn: Knex = db,
  ): Promise<ImportSessionRow | undefined> {
    return conn<ImportSessionRow>('import_sessions').where({ id, clinica_id }).first();
  },

  // Read-only: sessions for a set of files in one clinic, newest first, so the
  // caller can pick the latest session status per file. ALWAYS tenant-scoped.
  // Returns [] for an empty id list (avoids a WHERE IN () that matches nothing
  // ambiguously).
  async listByFileIdsForClinic(
    fileIds: string[],
    clinica_id: string,
    conn: Knex = db,
  ): Promise<ImportSessionRow[]> {
    if (fileIds.length === 0) return [];
    return conn<ImportSessionRow>('import_sessions')
      .where({ clinica_id })
      .whereIn('import_file_id', fileIds)
      .orderBy('criado_em', 'desc');
  },

  // Transitions a session from one status to another. Always filters by
  // clinica_id (tenant isolation) AND by expected current status so a stale
  // request can't skip steps (e.g. validated → ready_for_import only).
  async updateStatusForClinic(
    id: string,
    clinica_id: string,
    fromStatus: ImportSessionStatus,
    toStatus: ImportSessionStatus,
    conn: Knex = db,
  ): Promise<ImportSessionRow | undefined> {
    const [row] = await conn<ImportSessionRow>('import_sessions')
      .where({ id, clinica_id, status: fromStatus })
      .update({ status: toStatus, atualizado_em: conn.fn.now() })
      .returning('*');
    return row;
  },

  // Completes an import: flips status to 'import_completed' AND persists the
  // receipt (counts + metadata, NEVER patient values). Tenant-scoped and
  // guarded by the expected current status (CAS). Intended to be called from
  // inside the import transaction so the patients insert and the receipt land
  // atomically. The summary is stringified for jsonb on insert/update.
  async markCompletedForClinic(
    id: string,
    clinica_id: string,
    summary: Record<string, unknown>,
    importedByUserId: string,
    conn: Knex = db,
  ): Promise<ImportSessionRow | undefined> {
    const [row] = await conn<ImportSessionRow>('import_sessions')
      .where({ id, clinica_id, status: 'import_started' })
      .update({
        status: 'import_completed',
        import_summary_json: JSON.stringify(
          summary,
        ) as unknown as ImportSessionRow['import_summary_json'],
        imported_at: conn.fn.now() as unknown as Date,
        imported_by_user_id: importedByUserId,
        atualizado_em: conn.fn.now(),
      })
      .returning('*');
    return row;
  },
};
