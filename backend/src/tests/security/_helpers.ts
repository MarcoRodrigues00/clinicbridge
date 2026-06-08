// Shared helpers for the DB-FREE security test suite (sprint SEC-FINAL.1).
//
// These tests run with `tsx --test` (the project's existing runner) and must NOT
// touch Postgres: they exercise pure functions, middleware with mocked deps, and
// static repository checks. Deeper cross-tenant / audit-row coverage that needs a
// real database lives in src/tests/integration/*.integration.test.ts and runs in
// CI against a throwaway Postgres service.

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { execSync } from 'node:child_process';

// Runs an Express middleware and resolves to 'OK' when next() is called with no
// error, or to the value passed to next(err). Supports async middleware.
export async function runMiddleware(
  handler: RequestHandler,
  req: Partial<Request>,
): Promise<'OK' | unknown> {
  return await new Promise((resolve) => {
    const next: NextFunction = (err?: unknown) => resolve(err === undefined ? 'OK' : err);
    const result = handler(req as Request, {} as Response, next);
    // requireClinic is async and may reject without calling next() on a thrown
    // (non-HttpError) error — surface that too.
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      (result as Promise<unknown>).then(undefined, (err) => resolve(err));
    }
  });
}

// Absolute path of the repository root (works regardless of the test cwd).
export function repoRoot(): string {
  return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
}
