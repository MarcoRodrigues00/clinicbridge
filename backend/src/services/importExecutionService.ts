import { db } from '../config/db';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import { importSessionDao } from '../dao/importSessionDao';
import { HttpError } from '../middlewares/errorHandler';
import type {
  ImportExecutionResult,
  ImportExecutionSummary,
} from '../models/importExecution';
import type { PatientRow } from '../models/patient';
import { importDryRunService } from './importDryRunService';
import type { AuthContext } from './authService';

export interface ImportExecutionActor {
  clinica_id: string;
  usuario_id: string;
}

async function safeAudit(input: {
  acao: string;
  recurso_id: string | null;
  actor: ImportExecutionActor;
  ctx: AuthContext;
}): Promise<void> {
  try {
    await auditLogDao.create({
      acao: input.acao,
      usuario_id: input.actor.usuario_id,
      clinica_id: input.actor.clinica_id,
      recurso: 'import_session',
      recurso_id: input.recurso_id,
      ip: input.ctx.ip,
      user_agent: input.ctx.user_agent,
      request_id: input.ctx.request_id,
    });
  } catch (err) {
    logger.error({ err, acao: input.acao, audit_write_failed: true }, 'audit log write failed');
  }
}

export const importExecutionService = {
  // First real import. Strict rules:
  //   - session must belong to the actor's clinic and be ready_for_import;
  //   - we re-run the dry-run on the SAME parse+classify path (no client data);
  //   - any blocked row aborts (no partial imports);
  //   - nothing to import aborts;
  //   - more than IMPORT_MAX_ROWS aborts (small, auditable first run);
  //   - INSERT runs inside a single transaction together with the
  //     import_started → import_completed status transition. Any failure
  //     rolls patients back and flips the session to 'failed'.
  // Returns counts only. NEVER returns patient values.
  async executeImport(
    sessionId: string,
    actor: ImportExecutionActor,
    ctx: AuthContext,
  ): Promise<ImportExecutionResult> {
    // 1. Tenant + status gate (read-only)
    const session = await importSessionDao.findByIdForClinic(sessionId, actor.clinica_id);
    if (!session) {
      throw new HttpError(404, 'import_session_not_found', 'Sessão de migração não encontrada.');
    }
    if (session.status !== 'ready_for_import') {
      throw new HttpError(
        400,
        'import_session_not_ready',
        'Esta revisão não está pronta para importação.',
      );
    }

    // 2. Re-run the dry-run from the actual file + saved mapping.
    let report;
    let drafts;
    try {
      const out = await importDryRunService.classifyForImport(sessionId, actor.clinica_id);
      report = out.report;
      drafts = out.drafts;
    } catch (err) {
      await safeAudit({
        acao: 'import_session.import.failed',
        recurso_id: sessionId,
        actor,
        ctx,
      });
      throw err;
    }

    // 3. Safety: any blocked, nothing importable, or above the per-run cap
    //    aborts with explicit error codes BEFORE any write.
    if (report.summary.blocked_count > 0) {
      await safeAudit({
        acao: 'import_session.import.failed',
        recurso_id: sessionId,
        actor,
        ctx,
      });
      throw new HttpError(
        400,
        'import_session_has_blocking_errors',
        'A revisão ainda possui linhas bloqueadas. Corrija ou revise antes de importar.',
      );
    }
    if (report.summary.would_import_count <= 0) {
      await safeAudit({
        acao: 'import_session.import.failed',
        recurso_id: sessionId,
        actor,
        ctx,
      });
      throw new HttpError(
        400,
        'import_session_nothing_to_import',
        'Nenhuma linha desta revisão seria importada.',
      );
    }
    if (report.summary.would_import_count > env.IMPORT_MAX_ROWS) {
      await safeAudit({
        acao: 'import_session.import.failed',
        recurso_id: sessionId,
        actor,
        ctx,
      });
      throw new HttpError(
        400,
        'import_limit_exceeded',
        'Esta importação excede o limite atual de segurança. Reduza o arquivo ou aumente o limite em ambiente controlado.',
      );
    }

    // 4. Transition ready_for_import → import_started with CAS. If another
    //    request raced us we lose here, never insert anything.
    const started = await importSessionDao.updateStatusForClinic(
      sessionId,
      actor.clinica_id,
      'ready_for_import',
      'import_started',
    );
    if (!started) {
      await safeAudit({
        acao: 'import_session.import.failed',
        recurso_id: sessionId,
        actor,
        ctx,
      });
      throw new HttpError(
        400,
        'import_session_not_ready',
        'Esta revisão não está pronta para importação.',
      );
    }

    await safeAudit({
      acao: 'import_session.import.started',
      recurso_id: sessionId,
      actor,
      ctx,
    });

    // 5. Insert + status flip + receipt persistence in a single transaction.
    //    Any failure rolls back the patient inserts AND the import_completed
    //    transition AND the receipt write — the row simply stays in
    //    'import_started' until the catch flips it to 'failed' outside the tx.
    let importedCount = 0;
    let persistedSummary: ImportExecutionSummary | null = null;
    try {
      await db.transaction(async (trx) => {
        if (drafts.length > 0) {
          const rows = drafts.map((d) => ({
            clinica_id: actor.clinica_id,
            import_session_id: sessionId,
            nome: d.nome,
            telefone: d.telefone,
            email: d.email,
            cpf: d.cpf,
            data_nascimento: d.data_nascimento,
            convenio: null,
            numero_carteirinha: null,
            status: 'active',
            origem: 'import',
          }));
          // Single bulk insert: smaller transaction footprint and no per-row
          // round-trips. No RETURNING — we never expose the new patient ids.
          await trx<PatientRow>('patients').insert(rows);
          importedCount = rows.length;
        }

        // Build the receipt (counts + metadata ONLY — never patient values)
        // and persist it together with the status flip inside the same tx.
        const summary: ImportExecutionSummary = {
          session_id: sessionId,
          imported_count: importedCount,
          skipped_count: report.summary.total_rows_analyzed - importedCount,
          total_rows_analyzed: report.summary.total_rows_analyzed,
          status: 'completed',
          patients_created: importedCount,
          import_max_rows: env.IMPORT_MAX_ROWS,
        };

        const completedRow = await importSessionDao.markCompletedForClinic(
          sessionId,
          actor.clinica_id,
          summary as unknown as Record<string, unknown>,
          actor.usuario_id,
          trx,
        );
        if (!completedRow) {
          // Status changed under us — should not happen but treat as failure.
          throw new HttpError(
            500,
            'import_execution_failed',
            'Não foi possível concluir a importação.',
          );
        }
        persistedSummary = summary;
      });
    } catch (err) {
      // Patients rolled back. Mark the session as failed so the user sees the
      // real state and so we don't auto-retry.
      await importSessionDao.updateStatusForClinic(
        sessionId,
        actor.clinica_id,
        'import_started',
        'failed',
      );
      await safeAudit({
        acao: 'import_session.import.failed',
        recurso_id: sessionId,
        actor,
        ctx,
      });
      if (err instanceof HttpError) throw err;
      throw new HttpError(
        500,
        'import_execution_failed',
        'Não foi possível concluir a importação.',
      );
    }

    await safeAudit({
      acao: 'import_session.import.completed',
      recurso_id: sessionId,
      actor,
      ctx,
    });

    if (!persistedSummary) {
      // Defensive — the transaction succeeded, so the summary was built and
      // assigned. If we ever reach this branch something tampered with the
      // closure; fail loudly rather than return a bogus shape.
      throw new HttpError(
        500,
        'import_execution_failed',
        'Não foi possível concluir a importação.',
      );
    }

    return {
      session_id: sessionId,
      status: 'completed',
      summary: persistedSummary,
    };
  },
};
