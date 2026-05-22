import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { HttpError } from './errorHandler';
import { tokenService, type AuthClaims } from '../services/tokenService';
import type { UserPapel } from '../models/user';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthClaims;
    }
  }
}

export const requireAuth: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(new HttpError(401, 'unauthorized', 'Autenticação necessária.'));
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    req.auth = tokenService.verify(token);
    next();
  } catch {
    next(new HttpError(401, 'unauthorized', 'Token inválido ou expirado.'));
  }
};

// To be composed after requireAuth on any tenant-scoped route. Refuses requests where the
// token has no associated clinic (admin_sistema, or a partially provisioned user).
export const requireClinic: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (!req.auth) {
    next(new HttpError(401, 'unauthorized', 'Autenticação necessária.'));
    return;
  }
  if (!req.auth.clinica_id) {
    next(new HttpError(403, 'no_clinic_context', 'Nenhuma clínica associada ao usuário.'));
    return;
  }
  next();
};

// Roles allowed to perform sensitive administrative actions within a clinic
// (real import, patient export, retention preview, mark-ready). `dono_clinica`
// is the clinic owner. `secretaria` (operator) is intentionally excluded — they
// can prepare reviews but not execute the sensitive steps. `admin_sistema` has no
// clinic context, so requireClinic already blocks it from these tenant routes.
export const CLINIC_ADMIN_ROLES: readonly UserPapel[] = ['dono_clinica'];

// Authorization gate by role. Compose AFTER requireAuth (needs req.auth) and,
// for tenant routes, AFTER requireClinic — it never bypasses tenant isolation.
// Reads the role from the verified JWT claims (no per-request DB hit), matching
// how clinica_id/papel are already consumed across the app.
export function requireRole(allowed: readonly UserPapel[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new HttpError(401, 'unauthorized', 'Autenticação necessária.'));
      return;
    }
    if (!allowed.includes(req.auth.papel)) {
      next(
        new HttpError(
          403,
          'forbidden_role',
          'Você não tem permissão para executar esta ação.',
        ),
      );
      return;
    }
    next();
  };
}
