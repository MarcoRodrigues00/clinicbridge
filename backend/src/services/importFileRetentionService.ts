import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import { importFileDao } from '../dao/importFileDao';
import { importSessionDao } from '../dao/importSessionDao';
import { HttpError } from '../middlewares/errorHandler';
import type {
  RetentionCandidate,
  RetentionDryRunResult,
} from '../models/importFileRetention';
import type { ImportSessionRow } from '../models/importSession';
import type { AuthContext } from './authService';

export interface RetentionActor {
  clinica_id: string;
  usuario_id: string;
}

export interface RetentionDryRunOptions {
  // Already validated by the controller (1..365 and 1..MAX respectively).
  retentionDays: number;
  limit: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// A file is still "in active flow" — and therefore NOT a cleanup candidate — if
// its most recent migration session is in one of these non-final statuses.
// Final/absent sessions (import_completed, failed, cancelled, or none) make the
// raw upload eligible for cleanup in a future sprint.
const ACTIVE_SESSION_STATUSES = new Set<string>([
  'validated',
  'ready_for_import',
  'import_started',
]);

async function safeAudit(
  acao: string,
  actor: RetentionActor,
  ctx: AuthContext,
): Promise<void> {
  try {
    await auditLogDao.create({
      acao,
      usuario_id: actor.usuario_id,
      clinica_id: actor.clinica_id,
      recurso: 'import_file',
      recurso_id: null,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
    });
  } catch (err) {
    logger.error({ err, acao, audit_write_failed: true }, 'audit log write failed');
  }
}

export const importFileRetentionService = {
  // READ-ONLY preview of cleanup candidates. NEVER deletes a file or a row, and
  // NEVER touches patients/import_sessions. Returns only safe metadata — no
  // filename, internal name, path, hash or content.
  async dryRun(
    actor: RetentionActor,
    options: RetentionDryRunOptions,
    ctx: AuthContext,
  ): Promise<RetentionDryRunResult> {
    try {
      const cutoff = new Date(Date.now() - options.retentionDays * MS_PER_DAY);

      // Fetch one extra row to detect whether the cap truncated the scan.
      const files = await importFileDao.listOlderThanForClinic(
        actor.clinica_id,
        cutoff,
        options.limit + 1,
      );
      const scanLimited = files.length > options.limit;
      const page = scanLimited ? files.slice(0, options.limit) : files;

      // Latest session status per file (one query; rows come newest-first so the
      // first occurrence per file_id is the latest).
      const sessions = await importSessionDao.listByFileIdsForClinic(
        page.map((f) => f.id),
        actor.clinica_id,
      );
      const latestStatusByFile = new Map<string, string>();
      for (const s of sessions as ImportSessionRow[]) {
        if (!latestStatusByFile.has(s.import_file_id)) {
          latestStatusByFile.set(s.import_file_id, s.status);
        }
      }

      const candidates: RetentionCandidate[] = [];
      for (const f of page) {
        const latest = latestStatusByFile.get(f.id) ?? null;
        // Skip files still moving through the import flow.
        if (latest !== null && ACTIVE_SESSION_STATUSES.has(latest)) {
          continue;
        }
        candidates.push({
          id: f.id,
          status: f.status,
          extensao: f.extensao,
          mime_type: f.mime_type,
          tamanho_bytes: Number(f.tamanho_bytes),
          criado_em: f.criado_em,
          has_import_session: latest !== null,
          latest_session_status: latest,
        });
      }

      await safeAudit('import_file.retention.dry_run.success', actor, ctx);

      return {
        retention_days: options.retentionDays,
        candidates_count: candidates.length,
        scan_limited: scanLimited,
        candidates,
      };
    } catch (err) {
      await safeAudit('import_file.retention.dry_run.failure', actor, ctx);
      if (err instanceof HttpError) throw err;
      throw new HttpError(
        500,
        'import_file_retention_failed',
        'Não foi possível analisar a retenção de arquivos.',
      );
    }
  },
};
