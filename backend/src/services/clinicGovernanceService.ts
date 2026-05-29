import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import { clinicGovernanceDao } from '../dao/clinicGovernanceDao';
import { userDao } from '../dao/userDao';
import { HttpError } from '../middlewares/errorHandler';
import type {
  ClinicGovernanceMemberRow,
  ClinicGovernanceRole,
  ClinicGovernanceStatus,
} from '../types/db';
import type { AuthContext } from './authService';

// Governance actor threaded from the controller. Route-level gating is
// requireRole(CLINIC_ADMIN_ROLES) (dono_clinica); the service re-derives nothing
// from the HTTP request directly.
export interface GovernanceActor {
  clinica_id: string;
  usuario_id: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new HttpError(400, 'invalid_governance', `Identificador inválido: ${field}.`);
  }
  return value;
}

// Generic 404 covers: target user doesn't exist, belongs to another clinic, or
// is inactive. Anti-enumeration mirrors userClinicalRoleService / clinicMember.
function memberNotFound(): HttpError {
  return new HttpError(404, 'member_not_found', 'Membro não encontrado.');
}

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
  actor: GovernanceActor,
  ctx: AuthContext,
): Promise<void> {
  try {
    await auditLogDao.create({
      acao,
      usuario_id: actor.usuario_id,
      clinica_id: actor.clinica_id,
      recurso: 'clinic_governance_member',
      // recurso_id holds the governance row id — NEVER the target user_id (which
      // would be member identity vs. the governance event identity).
      recurso_id,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
    });
  } catch (err) {
    // Best-effort administrative audit (mirrors userClinicalRoleService). Never
    // logs PII or member identity — only the action label and failure cause.
    logger.error({ err, acao, audit_write_failed: true }, 'audit log write failed');
  }
}

// Metadata-only public shape. NO clinical data, NO billing, NO secrets.
export interface PublicGovernanceMember {
  user_id: string;
  nome: string;
  email: string;
  governance_role: ClinicGovernanceRole;
  status: ClinicGovernanceStatus;
  created_at: Date;
}

export const clinicGovernanceService = {
  // ── Internal helpers (foundation for future enforcement; ADR 0019) ─────────

  // Active governance rows for a clinic (raw). Tenant-scoped via the DAO.
  async getGovernanceForClinic(clinica_id: string): Promise<ClinicGovernanceMemberRow[]> {
    const rows = await clinicGovernanceDao.listActiveByClinic(clinica_id);
    // Strip the joined user fields — helper callers want governance rows only.
    return rows.map(({ user_nome: _n, user_email: _e, ...row }) => row);
  },

  // Active governance row for a user in a clinic, or undefined. Tenant-scoped.
  async getGovernanceMember(
    clinica_id: string,
    user_id: string,
  ): Promise<ClinicGovernanceMemberRow | undefined> {
    return clinicGovernanceDao.findActiveMember(clinica_id, user_id);
  },

  // Throws 403 unless the actor is the ACTIVE titular of their own clinic.
  // Reserved for future titular-only actions (transfer, remove admin, etc.).
  async assertClinicTitular(actor: GovernanceActor): Promise<ClinicGovernanceMemberRow> {
    const titular = await clinicGovernanceDao.findActiveTitular(actor.clinica_id);
    if (!titular || titular.user_id !== actor.usuario_id) {
      throw new HttpError(
        403,
        'governance_titular_required',
        'Apenas o titular da clínica pode executar esta ação.',
      );
    }
    return titular;
  },

  // Throws 403 unless the actor is the ACTIVE titular OR an ACTIVE administrador
  // of their own clinic. Reserved for future high-power administrative actions.
  async assertClinicAdministratorOrTitular(
    actor: GovernanceActor,
  ): Promise<ClinicGovernanceMemberRow> {
    const member = await clinicGovernanceDao.findActiveMember(
      actor.clinica_id,
      actor.usuario_id,
    );
    if (!member || (member.governance_role !== 'titular' && member.governance_role !== 'administrador')) {
      throw new HttpError(
        403,
        'governance_admin_required',
        'Apenas o titular ou um administrador da clínica pode executar esta ação.',
      );
    }
    return member;
  },

  // ── Endpoints ──────────────────────────────────────────────────────────────

  // Read-only list of active governance members. Owner/titular only at the
  // route. ALWAYS tenant-scoped. Metadata-only.
  async listForClinic(
    actor: GovernanceActor,
    ctx: AuthContext,
  ): Promise<{ members: PublicGovernanceMember[] }> {
    const rows = await clinicGovernanceDao.listActiveByClinic(actor.clinica_id);
    await safeAudit('clinic.governance.list', null, actor, ctx);
    return {
      members: rows.map((r) => ({
        user_id: r.user_id,
        nome: r.user_nome,
        email: r.user_email,
        governance_role: r.governance_role,
        status: r.status,
        created_at: r.created_at,
      })),
    };
  },

  // Titular promotes a member of their own clinic to `administrador`. Rejects:
  //   - actor is not the titular            → 403 governance_titular_required
  //   - target not in clinic / inactive     → 404 member_not_found
  //   - target is admin_sistema             → 404 member_not_found
  //   - target already has active governance → 400 governance_member_exists
  // Does NOT grant any clinical access (ADR 0019 invariant). Audited.
  async promoteAdministrator(
    actor: GovernanceActor,
    body: { user_id?: unknown },
    ctx: AuthContext,
  ): Promise<PublicGovernanceMember> {
    // Titular-only (governance DB check, beyond the route's requireRole).
    await this.assertClinicTitular(actor);

    const target_user_id = parseUuid(body.user_id, 'user_id');

    // Same-clinic + active. Generic 404 (anti-enumeration of cross-tenant id).
    const target = await userDao.findById(target_user_id);
    if (!target || !target.ativo || target.clinica_id !== actor.clinica_id) {
      throw memberNotFound();
    }
    // admin_sistema has no clinic context and cannot hold clinic governance.
    if (target.papel === 'admin_sistema') {
      throw memberNotFound();
    }

    let row: ClinicGovernanceMemberRow;
    try {
      row = await clinicGovernanceDao.insertMember({
        clinica_id: actor.clinica_id,
        user_id: target_user_id,
        governance_role: 'administrador',
        created_by_user_id: actor.usuario_id,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        // The target already has an active governance row (titular or admin).
        // Generic 400 — never reveals which role they currently hold.
        throw new HttpError(
          400,
          'governance_member_exists',
          'Este membro já possui um papel de governança ativo na clínica.',
        );
      }
      throw err;
    }

    await safeAudit('clinic.governance.admin.granted', row.id, actor, ctx);
    return {
      user_id: target.id,
      nome: target.nome,
      email: target.email,
      governance_role: row.governance_role,
      status: row.status,
      created_at: row.created_at,
    };
  },
};
