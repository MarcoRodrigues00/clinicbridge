import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { HttpError } from './errorHandler';
import { tokenService, type AuthClaims } from '../services/tokenService';
import type { UserPapel } from '../models/user';
import { userDao } from '../dao/userDao';

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
//
// Sprint 3.25 — additional DB membership check: reads users.clinica_id and
// users.ativo to make member deactivation effective IMMEDIATELY, instead of
// waiting for the JWT to expire. Without this, a member removed by the owner
// could still hit tenant routes with their old token. Cost: one indexed SELECT
// per tenant-scoped request — acceptable for an administrative MVP.
//
// `papel` is NOT re-validated against the DB here. The only realistic rebase
// (`dono_clinica → secretaria`) doesn't exist as a flow yet (Sprint 3.25 does
// not implement role changes), so the JWT remains the source of truth for the
// role until rotation. Documented in docs/security-notes.md.
export const requireClinic: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!req.auth) {
    next(new HttpError(401, 'unauthorized', 'Autenticação necessária.'));
    return;
  }
  if (!req.auth.clinica_id) {
    next(new HttpError(403, 'no_clinic_context', 'Nenhuma clínica associada ao usuário.'));
    return;
  }
  try {
    const user = await userDao.findById(req.auth.sub);
    if (!user || !user.ativo) {
      // Same shape as requireAuth's invalid-token response (no enumeration).
      next(new HttpError(401, 'unauthorized', 'Sessão inválida.'));
      return;
    }
    if (user.clinica_id !== req.auth.clinica_id) {
      // The token still carries the old clinic; the DB no longer agrees. This
      // is the post-deactivation path. Generic 403 — never reveals whether the
      // user joined another clinic in the meantime.
      next(
        new HttpError(
          403,
          'clinic_membership_revoked',
          'Seu acesso a esta clínica não está mais ativo. Faça login novamente.',
        ),
      );
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
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
