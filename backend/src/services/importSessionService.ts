import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import { importFileDao } from '../dao/importFileDao';
import { importSessionDao } from '../dao/importSessionDao';
import { HttpError } from '../middlewares/errorHandler';
import { toPublicImportFile } from '../models/importFile';
import {
  toPublicImportSession,
  type PublicImportSession,
} from '../models/importSession';
import { TARGET_FIELDS, type MappingInput } from '../models/importValidation';
import { importDryRunService } from './importDryRunService';
import { importValidationService } from './importValidationService';
import type { AuthContext } from './authService';

export interface ImportSessionActor {
  clinica_id: string;
  usuario_id: string;
}

async function safeAudit(input: {
  acao: string;
  recurso: string;
  recurso_id: string | null;
  actor: ImportSessionActor;
  ctx: AuthContext;
}): Promise<void> {
  try {
    await auditLogDao.create({
      acao: input.acao,
      usuario_id: input.actor.usuario_id,
      clinica_id: input.actor.clinica_id,
      recurso: input.recurso,
      recurso_id: input.recurso_id,
      ip: input.ctx.ip,
      user_agent: input.ctx.user_agent,
      request_id: input.ctx.request_id,
    });
  } catch (err) {
    logger.error({ err, acao: input.acao, audit_write_failed: true }, 'audit log write failed');
  }
}

async function buildSessionWithFile(
  row: Awaited<ReturnType<typeof importSessionDao.findByIdForClinic>>,
  clinica_id: string,
): Promise<PublicImportSession | null> {
  if (!row) return null;
  const fileRow = await importFileDao.findByIdForClinic(row.import_file_id, clinica_id);
  if (!fileRow) return null; // file removed out-of-band — skip rather than leak a broken ref
  return toPublicImportSession(row, toPublicImportFile(fileRow));
}

export const importSessionService = {
  // Creates a "migration review" session. Crucially, the validation is RE-RUN on
  // the backend from the file + mapping — we never trust a report sent by the
  // client. The stored mapping is derived from the backend report's field_stats.
  async create(
    importFileId: string,
    rawMapping: unknown,
    actor: ImportSessionActor,
    ctx: AuthContext,
  ): Promise<PublicImportSession> {
    try {
      const report = await importValidationService.generateReport(
        importFileId,
        rawMapping,
        actor,
        ctx,
      );

      const mapping: MappingInput = {};
      for (const field of TARGET_FIELDS) {
        mapping[field] = report.field_stats[field]?.mapped_column ?? null;
      }

      const row = await importSessionDao.create({
        clinica_id: actor.clinica_id,
        usuario_id: actor.usuario_id,
        import_file_id: importFileId,
        status: 'validated',
        mapping,
        validation_summary: report.summary,
        field_stats: report.field_stats,
        issues_sample: report.issues,
      });

      await safeAudit({
        acao: 'import_session.created',
        recurso: 'import_session',
        recurso_id: row.id,
        actor,
        ctx,
      });

      return toPublicImportSession(row, report.file);
    } catch (err) {
      await safeAudit({
        acao: 'import_session.create_failed',
        recurso: 'import_file',
        recurso_id: importFileId,
        actor,
        ctx,
      });
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, 'import_session_failed', 'Não foi possível salvar a revisão.');
    }
  },

  async listForClinic(clinica_id: string): Promise<PublicImportSession[]> {
    const rows = await importSessionDao.listByClinic(clinica_id);
    const out: PublicImportSession[] = [];
    const fileCache = new Map<string, ReturnType<typeof toPublicImportFile> | null>();
    for (const row of rows) {
      let pf = fileCache.get(row.import_file_id);
      if (pf === undefined) {
        const fileRow = await importFileDao.findByIdForClinic(row.import_file_id, clinica_id);
        pf = fileRow ? toPublicImportFile(fileRow) : null;
        fileCache.set(row.import_file_id, pf);
      }
      if (pf) out.push(toPublicImportSession(row, pf));
    }
    return out;
  },

  async getForClinic(id: string, clinica_id: string): Promise<PublicImportSession> {
    const row = await importSessionDao.findByIdForClinic(id, clinica_id);
    const session = await buildSessionWithFile(row, clinica_id);
    if (!session) {
      throw new HttpError(404, 'import_session_not_found', 'Sessão de migração não encontrada.');
    }
    return session;
  },

  // Marks a validated review as "ready for import". This does NOT import any
  // patient and does NOT INSERT into the patients table. It re-runs the
  // dry-run on the backend (we never trust counts sent by the client) and
  // refuses to advance if any row is still blocked or nothing would be
  // imported.
  async markReady(
    sessionId: string,
    actor: ImportSessionActor,
    ctx: AuthContext,
  ): Promise<PublicImportSession> {
    try {
      const row = await importSessionDao.findByIdForClinic(sessionId, actor.clinica_id);
      if (!row) {
        throw new HttpError(404, 'import_session_not_found', 'Sessão de migração não encontrada.');
      }
      if (row.status !== 'validated') {
        throw new HttpError(
          400,
          'import_session_invalid_status',
          'Esta revisão não está no estado correto para ser preparada.',
        );
      }

      // Re-run the dry-run on the backend so the decision is based on the
      // actual file + mapping right now, not anything the client claims.
      const report = await importDryRunService.run(sessionId, actor, ctx);

      if (report.summary.blocked_count > 0) {
        throw new HttpError(
          400,
          'import_session_has_blocking_errors',
          'A revisão ainda possui linhas bloqueadas. Corrija ou revise antes de preparar a importação.',
        );
      }
      if (report.summary.would_import_count <= 0) {
        throw new HttpError(
          400,
          'import_session_nothing_to_import',
          'Nenhuma linha desta revisão seria importada. Revise o arquivo e o mapeamento.',
        );
      }

      const updated = await importSessionDao.updateStatusForClinic(
        sessionId,
        actor.clinica_id,
        'validated',
        'ready_for_import',
      );
      if (!updated) {
        // Status changed between the check and the update (concurrent request).
        throw new HttpError(
          400,
          'import_session_invalid_status',
          'Esta revisão não está no estado correto para ser preparada.',
        );
      }

      await safeAudit({
        acao: 'import_session.mark_ready.success',
        recurso: 'import_session',
        recurso_id: updated.id,
        actor,
        ctx,
      });

      return toPublicImportSession(updated, report.file);
    } catch (err) {
      await safeAudit({
        acao: 'import_session.mark_ready.failure',
        recurso: 'import_session',
        recurso_id: sessionId,
        actor,
        ctx,
      });
      if (err instanceof HttpError) throw err;
      throw new HttpError(
        400,
        'import_session_mark_ready_failed',
        'Não foi possível preparar a revisão.',
      );
    }
  },
};
