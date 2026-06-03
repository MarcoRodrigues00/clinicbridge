import type { NextFunction, Request, Response } from 'express';
import { HttpError } from './errorHandler';
import { tokenService } from '../services/tokenService';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Backend read-only guard for the public guided demo. Sessions minted by
// /auth/demo-login carry an `is_demo` JWT claim; for those, any mutating verb is
// refused with 403 demo_readonly. This complements the frontend write-block and,
// because the claim is set ONLY by demo-login (never by a normal login), it can
// never affect a real clinic session.
//
// Mounted app-wide AFTER the auth router (so the demo user can still log in/out
// and the MFA endpoints work) and BEFORE the business routers. Tokens that are
// absent or invalid are intentionally ignored here and left for requireAuth to
// reject with the usual 401 — this middleware only ever ADDS a 403 for a valid,
// demo-flagged session, so it cannot change behavior for any other request.
export function blockDemoWrites(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next();
    return;
  }

  let isDemo = false;
  try {
    isDemo = tokenService.verify(header.slice('Bearer '.length).trim()).is_demo === true;
  } catch {
    // Invalid/expired token — not our concern; requireAuth will handle it.
    next();
    return;
  }

  if (isDemo) {
    next(
      new HttpError(
        403,
        'demo_readonly',
        'Esta é uma demonstração — alterações ficam desativadas para manter os dados de exemplo.',
      ),
    );
    return;
  }

  next();
}
