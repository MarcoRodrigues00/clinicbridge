import { db } from '../config/db';
import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import { clinicDao } from '../dao/clinicDao';
import { clinicMemberDao } from '../dao/clinicMemberDao';
import { userDao } from '../dao/userDao';
import { HttpError } from '../middlewares/errorHandler';
import {
  toPublicClinicMember,
  type PublicClinicMember,
} from '../models/clinicMember';
import type { AuthContext } from './authService';

// Owner identity threaded from the controller (services never touch the HTTP
// request directly). requireRole(CLINIC_ADMIN_ROLES) already gated the route.
export interface ClinicOwnerActor {
  clinica_id: string;
  usuario_id: string;
}

async function safeAudit(
  acao: string,
  usuario_id: string | null,
  clinica_id: string | null,
  recurso_id: string | null,
  ctx: AuthContext,
): Promise<void> {
  try {
    await auditLogDao.create({
      acao,
      usuario_id,
      clinica_id,
      recurso: 'clinic_member',
      // recurso_id is always a UUID (member's user_id or null for list); no PII.
      recurso_id,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
    });
  } catch (err) {
    logger.error({ err, acao, audit_write_failed: true }, 'audit log write failed');
  }
}

export const clinicMemberService = {
  // Lists the clinic's team: currently active members + ex-members (revoked).
  // The list is owner-only at the route level; the service re-derives the
  // owner's identity defensively.
  async list(actor: ClinicOwnerActor, ctx: AuthContext): Promise<PublicClinicMember[]> {
    const clinic = await clinicDao.findById(actor.clinica_id);
    if (!clinic) throw new HttpError(403, 'forbidden', 'Acesso negado.');

    const [active, removed] = await Promise.all([
      clinicMemberDao.listActive(actor.clinica_id),
      clinicMemberDao.listRemoved(actor.clinica_id),
    ]);

    // De-dup defensively: if a former member rejoined, the active row wins.
    // (clinicMemberDao.listRemoved already excludes currently-linked users, so
    // this is belt-and-suspenders.)
    const activeIds = new Set(active.map((m) => m.user_id));
    const merged = [
      ...active,
      ...removed.filter((m) => !activeIds.has(m.user_id)),
    ];

    await safeAudit('clinic.member.list.success', actor.usuario_id, actor.clinica_id, null, ctx);
    return merged.map((row) => toPublicClinicMember(row, clinic.responsavel_id));
  },

  // Deactivates a member: clears users.clinica_id and writes a 'revoked' row in
  // clinic_join_requests for the history. The user's `ativo` flag is preserved
  // (this is NOT a global ban). After deactivation the JWT is "stale" — the
  // companion DB-check in requireClinic blocks further tenant-scoped requests.
  async deactivate(
    actor: ClinicOwnerActor,
    targetUserId: string,
    ctx: AuthContext,
  ): Promise<{ status: 'deactivated' }> {
    if (typeof targetUserId !== 'string' || targetUserId.length === 0) {
      throw new HttpError(404, 'member_not_found', 'Membro não encontrado.');
    }
    if (targetUserId === actor.usuario_id) {
      throw new HttpError(400, 'cannot_deactivate_self', 'Você não pode desativar o próprio acesso.');
    }

    const clinic = await clinicDao.findById(actor.clinica_id);
    if (!clinic) throw new HttpError(403, 'forbidden', 'Acesso negado.');
    if (targetUserId === clinic.responsavel_id) {
      // Defense in depth: the only owner of the clinic cannot be removed via
      // this endpoint. Owner transfer is explicitly out of scope (Sprint 3.25).
      throw new HttpError(400, 'cannot_deactivate_owner', 'O(a) dono(a) da clínica não pode ser desativado(a) por aqui.');
    }

    // Generic 404 covers: user doesn't exist, user belongs to another clinic,
    // user was already revoked. No enumeration possible from the response.
    const target = await userDao.findById(targetUserId);
    if (!target || target.clinica_id !== actor.clinica_id) {
      throw new HttpError(404, 'member_not_found', 'Membro não encontrado.');
    }

    await db.transaction(async (trx) => {
      const updated = await userDao.clearClinicIfMember(targetUserId, actor.clinica_id, trx);
      if (updated === 0) {
        // A concurrent change moved them out of the clinic between findById
        // and update. Treat as "already not a member" → generic 404.
        throw new HttpError(404, 'member_not_found', 'Membro não encontrado.');
      }
      await clinicMemberDao.insertRevoked(
        { clinic_id: actor.clinica_id, user_id: targetUserId, decided_by_user_id: actor.usuario_id },
        trx,
      );
    });

    await safeAudit(
      'clinic.member.deactivated.success',
      actor.usuario_id,
      actor.clinica_id,
      targetUserId,
      ctx,
    );
    return { status: 'deactivated' };
  },
};
