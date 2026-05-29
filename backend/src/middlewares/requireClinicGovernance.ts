import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { HttpError } from './errorHandler';
import { clinicGovernanceDao } from '../dao/clinicGovernanceDao';
import type { ClinicGovernanceRole } from '../types/db';

// Governance authorization gate (Sprint 6.1B; ADR 0019).
//
// Compose AFTER requireAuth + requireClinic — it never bypasses tenant
// isolation. Unlike requireRole (which reads the coarse JWT papel), this checks
// the GOVERNANCE axis: the user's ACTIVE row in clinic_governance_members for
// their own clinic. It does NOT use user_clinical_roles (clinical access) and
// does NOT use billing — governance is its own orthogonal axis.
//
// LEGACY/COMPAT: the 6.1A backfill created one `titular` row per existing
// clinic, but a clinic created AFTER that migration has a `dono_clinica` owner
// with no governance row yet (registration does not write one in this sprint).
// To keep every clinic owner working, a JWT papel of `dono_clinica` is treated
// as `titular` ONLY when the user has NO governance row at all (active or
// revoked) for the clinic. The DB row, when present, is authoritative.
//
// CRITICAL: the fallback must NEVER resurrect a member whose governance row was
// REVOKED. A revoked dono_clinica would otherwise re-acquire titular power just
// because no ACTIVE row exists. So the fallback is gated on "never had a row":
// if any row exists (even revoked/inactive), a non-matching active role yields a
// generic 403 — no fallback. `secretaria`/`admin_sistema` never get the fallback.
//
// Anti-enumeration: a denied request returns a generic 403 and never reveals
// whether another user holds the role.
function forbidden(): HttpError {
  return new HttpError(
    403,
    'forbidden_governance',
    'Você não tem permissão de governança para executar esta ação.',
  );
}

export function requireClinicGovernance(
  allowed: readonly ClinicGovernanceRole[],
): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.auth) {
      next(new HttpError(401, 'unauthorized', 'Autenticação necessária.'));
      return;
    }
    if (!req.auth.clinica_id) {
      // Mirrors requireClinic's shape (admin_sistema never reaches here once
      // requireClinic is composed first; this is defense in depth).
      next(new HttpError(403, 'no_clinic_context', 'Nenhuma clínica associada ao usuário.'));
      return;
    }
    try {
      const member = await clinicGovernanceDao.findActiveMember(
        req.auth.clinica_id,
        req.auth.sub,
      );
      if (member) {
        // An ACTIVE governance row is authoritative — allow only if its role is
        // in the allowlist; otherwise 403 (NO legacy fallback for an active
        // member who simply lacks the required role).
        if (allowed.includes(member.governance_role)) {
          next();
          return;
        }
        next(forbidden());
        return;
      }

      // No active row. Legacy fallback is allowed ONLY for a dono_clinica that
      // has NEVER had a governance row — never for a revoked member.
      if (allowed.includes('titular') && req.auth.papel === 'dono_clinica') {
        const hadRow = await clinicGovernanceDao.hasAnyMemberForUserClinic(
          req.auth.clinica_id,
          req.auth.sub,
        );
        if (!hadRow) {
          next();
          return;
        }
      }

      next(forbidden());
    } catch (err) {
      next(err);
    }
  };
}
