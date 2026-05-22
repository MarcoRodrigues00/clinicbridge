import { Router, type Request, type Response } from 'express';
import { db } from '../config/db';
import { env } from '../config/env';
import { logger } from '../config/logger';

export const healthRouter = Router();

// Liveness: "is the process up?". No dependencies, no DB, no auth, no PII.
// Kept stable for backward compatibility (existing /health callers).
function livenessBody(): Record<string, string> {
  return {
    status: 'ok',
    service: 'clinicbridge-backend',
    timestamp: new Date().toISOString(),
  };
}

healthRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json(livenessBody());
});

// Explicit liveness alias for orchestrators that distinguish live vs ready.
healthRouter.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json(livenessBody());
});

// Resolves the promise, or rejects after `ms` so a hung/down DB can't block the
// probe up to knex's long acquire timeout. The timer is unref'd so it never
// keeps the process alive.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error('readiness check timed out')), ms).unref();
    }),
  ]);
}

// Readiness: "can the app serve traffic?". Runs a light `select 1` against the
// existing knex pool. Returns 200 when the DB answers, 503 otherwise. Never auth,
// never PII, never audit_logs, and never leaks the connection string, raw error,
// stack or SQL — only a coarse "ok"/"error" per check.
healthRouter.get('/health/ready', async (_req: Request, res: Response) => {
  let databaseOk = false;
  try {
    await withTimeout(db.raw('select 1'), env.HEALTH_READY_DB_TIMEOUT_MS);
    databaseOk = true;
  } catch (err) {
    // Safe log only (message, never the connection string); response stays coarse.
    logger.warn(
      { err: err instanceof Error ? err.message : 'readiness db check failed' },
      'readiness: database check failed',
    );
  }

  res.status(databaseOk ? 200 : 503).json({
    status: databaseOk ? 'ready' : 'not_ready',
    service: 'clinicbridge-backend',
    timestamp: new Date().toISOString(),
    checks: { database: databaseOk ? 'ok' : 'error' },
  });
});
