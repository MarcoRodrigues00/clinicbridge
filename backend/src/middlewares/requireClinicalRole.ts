import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { userClinicalRoleDao } from '../dao/userClinicalRoleDao';
import type { UserClinicalRoleName } from '../types/db';
import { HttpError } from './errorHandler';

// Effective clinical capability — used by services to decide visibility
// scope. 'dono_clinica' is NOT a row in user_clinical_roles; it is sourced
// directly from req.auth.papel and treated as gestor-implicit (ADR 0010
// §6.2: "dono_clinica is the gestor implicitly for clinical reads").
export type ClinicalCapability = UserClinicalRoleName | 'dono_clinica';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      // Populated by requireClinicalRole AFTER requireAuth + requireClinic
      // succeed. Services consume this Set to apply "professional sees only
      // its own" (ADR 0010 §6.1 + §7) — they do NOT re-derive from req.auth.
      clinicalRoles?: Set<ClinicalCapability>;
    }
  }
}

// Clinical role gate (Sprint 4.2B-2; ADR 0010 §6.1, §11).
//
// MUST be composed AFTER `requireAuth` AND `requireClinic` — this middleware
// trusts that req.auth and req.auth.clinica_id are already verified, and
// that the user is still an active member of that clinic (the DB check in
// requireClinic, Sprint 3.25, makes deactivation effective immediately).
//
// Authorization rules:
//   1. `admin_sistema` cannot reach this middleware in practice — `requireClinic`
//      already blocks them (no clinic context). Defense in depth: this gate
//      ALSO rejects them with 403 if they somehow have a clinic.
//   2. `secretaria` (funcionario_administrativo, ADR 0009 §11) and any future
//      non-clinical administrative role are REJECTED — they never reach
//      clinical content (ADR 0010 §7).
//   3. `dono_clinica` passes WHEN AND ONLY WHEN one of the `allowed` roles is
//      a read-level capability (`gestor_clinica`). For write-level operations
//      (`profissional_clinico` only), the owner must ALSO have been granted
//      `profissional_clinico` in `user_clinical_roles` — ADR 0010 §7 row 1:
//      "the owner alone does NOT create an encounter; they need the
//      profissional_clinico grant too".
//   4. `profissional_clinico` and `gestor_clinica` come from active rows in
//      `user_clinical_roles` (revoked_at IS NULL). One indexed SELECT per
//      gated request — same pattern as requireClinic's DB check (Sprint 3.25)
//      and acceptable for an MVP.
//   5. 403 `forbidden_role` is generic; never reveals which role is missing
//      or whether the user has any clinical role at all in another clinic.
//
// req.clinicalRoles is set with the EFFECTIVE capabilities — `dono_clinica`
// is included when applicable, plus every active row from user_clinical_roles.
// Services use this Set to apply "professional sees only its own" without
// touching req.auth.papel themselves.
export function requireClinicalRole(
  allowed: readonly UserClinicalRoleName[],
): RequestHandler {
  if (allowed.length === 0) {
    throw new Error(
      'requireClinicalRole: refuse to register a route with an empty allowlist (would block everyone).',
    );
  }
  const allowedSet = new Set<UserClinicalRoleName>(allowed);
  // The owner passes implicitly only when a read-level role is in the
  // allowlist. Write-level operations (profissional_clinico only) require
  // an explicit grant — ADR 0010 §7 row 1.
  const ownerPassesImplicitly = allowedSet.has('gestor_clinica');

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.auth) {
      next(new HttpError(401, 'unauthorized', 'Autenticação necessária.'));
      return;
    }
    if (!req.auth.clinica_id) {
      // Defense in depth — requireClinic should have blocked this already.
      next(new HttpError(403, 'no_clinic_context', 'Nenhuma clínica associada ao usuário.'));
      return;
    }

    // Hard exclusions before any DB lookup — admin_sistema and any non-clinical
    // administrative papel never access clinical content (ADR 0010 §7).
    if (req.auth.papel === 'admin_sistema') {
      next(forbidden());
      return;
    }

    const effective = new Set<ClinicalCapability>();

    // Active clinical roles from the parallel table. ALWAYS tenant-scoped.
    let granted: UserClinicalRoleName[] = [];
    try {
      granted = await userClinicalRoleDao.listActiveRoleNames(
        req.auth.sub,
        req.auth.clinica_id,
      );
    } catch (err) {
      next(err);
      return;
    }
    for (const r of granted) effective.add(r);

    if (req.auth.papel === 'dono_clinica') {
      // Owner is always in the effective set for downstream service decisions
      // (services may need to know "this reader is the owner" to e.g. permit
      // reading encounters of other professionals). Authorization to the
      // route itself is decided next.
      effective.add('dono_clinica');
    }

    const passesViaGrant = [...allowedSet].some((r) => effective.has(r));
    const passesViaOwner = ownerPassesImplicitly && req.auth.papel === 'dono_clinica';

    if (!passesViaGrant && !passesViaOwner) {
      next(forbidden());
      return;
    }

    req.clinicalRoles = effective;
    next();
  };
}

function forbidden(): HttpError {
  // Single, generic 403 for ALL authorization mismatches in this middleware.
  // Same shape as requireRole's 'forbidden_role' (Sprint 3.6+) so the
  // frontend can render a single message; never reveals which role is missing
  // or whether the user has clinical access in another clinic.
  return new HttpError(
    403,
    'forbidden_role',
    'Você não tem permissão para acessar dados clínicos.',
  );
}
