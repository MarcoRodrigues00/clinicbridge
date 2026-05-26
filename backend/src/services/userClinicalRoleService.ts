import { db } from '../config/db';
import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import { userClinicalRoleDao } from '../dao/userClinicalRoleDao';
import { userDao } from '../dao/userDao';
import { HttpError } from '../middlewares/errorHandler';
import type { UserClinicalRoleName, UserClinicalRoleRow } from '../types/db';
import type { AuthContext } from './authService';

// Owner identity threaded from the controller. Granting/revoking clinical roles
// is owner-only at the route level (requireRole(CLINIC_ADMIN_ROLES) in 4.2B-3).
// The service re-derives nothing from the HTTP request directly.
export interface ClinicalRoleOwnerActor {
  clinica_id: string;
  usuario_id: string;
}

// Roles the v0.1 of the Prontuário accepts (ADR 0010 §3.5; ADR 0009 §4).
// `financeiro` is documented in the ADR but NOT in this allowlist — it ships
// with Sprint 4.4 (ADR 0012), not here. The DB CHECK constraint also rejects it.
const ALLOWED_CLINICAL_ROLES: readonly UserClinicalRoleName[] = [
  'profissional_clinico',
  'gestor_clinica',
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new HttpError(400, 'invalid_clinical_role', `Identificador inválido: ${field}.`);
  }
  return value;
}

function parseRole(value: unknown): UserClinicalRoleName {
  if (
    typeof value !== 'string' ||
    !(ALLOWED_CLINICAL_ROLES as readonly string[]).includes(value)
  ) {
    throw new HttpError(
      400,
      'invalid_clinical_role',
      `Papel clínico inválido. Use um de: ${ALLOWED_CLINICAL_ROLES.join(', ')}.`,
    );
  }
  return value as UserClinicalRoleName;
}

// Generic 404 covers: target user doesn't exist, target user belongs to another
// clinic, target user is inactive. Anti-enumeration mirrors clinicMemberService
// (Sprint 3.25): never reveals which condition failed.
function memberNotFound(): HttpError {
  return new HttpError(404, 'member_not_found', 'Membro não encontrado.');
}

// pg unique_violation handling. Mirrors clinicJoinRequestService + authService.
interface PgUniqueViolation {
  code: '23505';
}
function isUniqueViolation(err: unknown): err is PgUniqueViolation {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23505'
  );
}

async function safeAudit(
  acao: string,
  recurso_id: string | null,
  actor: ClinicalRoleOwnerActor,
  ctx: AuthContext,
): Promise<void> {
  try {
    await auditLogDao.create({
      acao,
      usuario_id: actor.usuario_id,
      clinica_id: actor.clinica_id,
      // Resource label kept short (audit_logs.recurso is varchar(60)). UUID of
      // the user_clinical_roles row lives in recurso_id; never the user_id of
      // the target (which would be PII vs. the grant identity).
      recurso: 'user_clinical_role',
      recurso_id,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
    });
  } catch (err) {
    // Best-effort administrative audit (mirrors clinicMemberService). NEVER
    // logs PII or the target user's identity — only the action label and the
    // technical failure cause.
    logger.error({ err, acao, audit_write_failed: true }, 'audit log write failed');
  }
}

// Public shape returned by the service. Excludes timestamps that are not yet
// needed by the (future) controller; can grow as 4.2B-3 wires endpoints.
export interface PublicClinicalRoleGrant {
  id: string;
  user_id: string;
  role: UserClinicalRoleName;
  granted_at: Date;
  granted_by_user_id: string | null;
}

function toPublic(row: UserClinicalRoleRow): PublicClinicalRoleGrant {
  return {
    id: row.id,
    user_id: row.user_id,
    role: row.role,
    granted_at: row.granted_at,
    granted_by_user_id: row.granted_by_user_id,
  };
}

export const userClinicalRoleService = {
  // Owner grants a clinical role to a member of their own clinic. The target
  // MUST be an ACTIVE member of the same clinic (defense in depth — the
  // partial unique index alone wouldn't prevent granting to a user of another
  // clinic if a stale id were supplied).
  async grant(
    actor: ClinicalRoleOwnerActor,
    body: { user_id?: unknown; role?: unknown },
    ctx: AuthContext,
  ): Promise<PublicClinicalRoleGrant> {
    const target_user_id = parseUuid(body.user_id, 'user_id');
    const role = parseRole(body.role);

    // Same-clinic + active. Generic 404 — anti-enumeration of cross-tenant
    // identity. Never reveal whether the user exists in another clinic.
    const target = await userDao.findById(target_user_id);
    if (
      !target ||
      !target.ativo ||
      target.clinica_id !== actor.clinica_id
    ) {
      throw memberNotFound();
    }

    // admin_sistema cannot receive a clinical role — they exist outside any
    // clinic and a grant would be meaningless (requireClinic blocks them
    // from clinical routes regardless). This is defense in depth.
    if (target.papel === 'admin_sistema') {
      throw memberNotFound();
    }

    let row: UserClinicalRoleRow;
    try {
      row = await userClinicalRoleDao.grant({
        user_id: target_user_id,
        clinica_id: actor.clinica_id,
        role,
        granted_by_user_id: actor.usuario_id,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        // An active grant already exists for (target, clinica, role). Generic
        // 400 — never reveals when/who granted it. The owner can list active
        // grants separately (future endpoint) if they need that detail.
        throw new HttpError(
          400,
          'clinical_role_already_granted',
          'Este papel clínico já está ativo para este membro.',
        );
      }
      throw err;
    }

    await safeAudit('clinical.role.granted.success', row.id, actor, ctx);
    return toPublic(row);
  },

  // Owner revokes an active clinical role grant by its id. CAS in the DAO
  // ensures (1) tenant isolation and (2) idempotency — a missed CAS surfaces
  // a generic 404, never enumerating "already revoked" vs. "wrong clinic".
  async revoke(
    actor: ClinicalRoleOwnerActor,
    role_id: string,
    ctx: AuthContext,
  ): Promise<{ status: 'revoked'; id: string }> {
    const id = parseUuid(role_id, 'id');

    let revoked: UserClinicalRoleRow | undefined;
    await db.transaction(async (trx) => {
      revoked = await userClinicalRoleDao.revoke(id, actor.clinica_id, actor.usuario_id, trx);
      if (!revoked) {
        throw new HttpError(
          404,
          'clinical_role_not_found',
          'Concessão de papel clínico não encontrada.',
        );
      }
      // Audit inside the transaction so a rollback also erases the audit row.
      // Mirrors patientMergeService (Sprint 3.33) — administrative writes that
      // pair audit with the side effect should fail/succeed together.
      try {
        await auditLogDao.create(
          {
            acao: 'clinical.role.revoked.success',
            usuario_id: actor.usuario_id,
            clinica_id: actor.clinica_id,
            recurso: 'user_clinical_role',
            recurso_id: revoked.id,
            ip: ctx.ip,
            user_agent: ctx.user_agent,
            request_id: ctx.request_id,
          },
          trx,
        );
      } catch (err) {
        logger.error(
          { err, acao: 'clinical.role.revoked.success', audit_write_failed: true },
          'audit log write failed',
        );
        throw err;
      }
    });

    // Non-null assertion safe — the transaction either set `revoked` or threw.
    return { status: 'revoked', id: revoked!.id };
  },

  // Read-only list of active grants in the clinic. Owner-only at the route.
  // ALWAYS tenant-scoped via the DAO.
  async listActive(
    actor: ClinicalRoleOwnerActor,
  ): Promise<{ grants: PublicClinicalRoleGrant[] }> {
    const rows = await userClinicalRoleDao.listActiveByClinic(actor.clinica_id);
    return { grants: rows.map(toPublic) };
  },
};
