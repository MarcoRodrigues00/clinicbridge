import { db } from '../config/db';
import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import { clinicDao } from '../dao/clinicDao';
import { clinicJoinRequestDao } from '../dao/clinicJoinRequestDao';
import { userDao } from '../dao/userDao';
import { HttpError } from '../middlewares/errorHandler';
import {
  toMyJoinRequest,
  toPendingJoinRequest,
  type MyJoinRequest,
  type PendingJoinRequest,
} from '../models/clinicJoinRequest';
import { formatInviteCode, normalizeInviteCode } from '../utils/inviteCode';
import type { AuthContext } from './authService';

// The actor identity threaded from the controller (never the req object).
export interface JoinRequestUserActor {
  usuario_id: string;
}
export interface ClinicOwnerActor {
  clinica_id: string;
  usuario_id: string;
}

const MESSAGE_MAX = 280;

// Generic error for any invite resolution failure (bad code OR name mismatch), so
// a caller cannot tell which part was wrong and cannot probe clinic existence.
function invalidInvite(): HttpError {
  return new HttpError(404, 'invalid_invite', 'Código de convite inválido.');
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
      recurso: 'clinic_join_request',
      // request id is a non-PII UUID; no name/email/code is ever recorded.
      recurso_id,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
    });
  } catch (err) {
    logger.error({ err, acao, audit_write_failed: true }, 'audit log write failed');
  }
}

function normalizeMessage(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new HttpError(400, 'invalid_message', 'Mensagem inválida.');
  const t = value.trim();
  if (t === '') return null;
  return t.slice(0, MESSAGE_MAX);
}

// Loose equality for the optional clinic-name confirmation: trim + collapse
// whitespace + casefold (accents kept). It's a confirmation, not a search.
function nameMatches(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  return norm(a) === norm(b);
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

export const clinicJoinRequestService = {
  // Owner reads their own clinic's invite code (to share out-of-band) + name.
  async getInviteCode(actor: ClinicOwnerActor): Promise<{ invite_code: string; clinic_name: string }> {
    const clinic = await clinicDao.findById(actor.clinica_id);
    if (!clinic) throw new HttpError(403, 'forbidden', 'Acesso negado.');
    return { invite_code: formatInviteCode(clinic.invite_code), clinic_name: clinic.nome };
  },

  // A secretaria (no clinic yet) requests to join a clinic by its invite code.
  // No auto-join: the request is created as 'pending'.
  async requestJoin(
    actor: JoinRequestUserActor,
    body: { invite_code: unknown; clinic_name?: unknown; message?: unknown },
    ctx: AuthContext,
  ): Promise<MyJoinRequest> {
    const user = await userDao.findById(actor.usuario_id);
    if (!user || !user.ativo) throw new HttpError(401, 'unauthorized', 'Sessão inválida.');
    // Already a member, or not a staff account → cannot request.
    if (user.clinica_id) {
      throw new HttpError(409, 'already_in_clinic', 'Você já pertence a uma clínica.');
    }
    if (user.papel !== 'secretaria') {
      throw new HttpError(403, 'forbidden_role', 'Apenas contas de funcionário podem solicitar entrada.');
    }

    const rawCode = typeof body.invite_code === 'string' ? body.invite_code : '';
    const code = normalizeInviteCode(rawCode);
    if (code.length === 0) throw invalidInvite();

    const clinic = await clinicDao.findByInviteCode(code);
    if (!clinic) throw invalidInvite();

    // Optional exact-name confirmation. Mismatch → same generic error (no probe).
    if (body.clinic_name !== undefined && body.clinic_name !== null && body.clinic_name !== '') {
      if (typeof body.clinic_name !== 'string' || !nameMatches(body.clinic_name, clinic.nome)) {
        throw invalidInvite();
      }
    }

    const message = normalizeMessage(body.message);

    const existing = await clinicJoinRequestDao.findPending(user.id, clinic.id);
    if (existing) {
      throw new HttpError(409, 'request_already_pending', 'Você já tem uma solicitação pendente para esta clínica.');
    }

    let row;
    try {
      row = await clinicJoinRequestDao.create({ clinic_id: clinic.id, user_id: user.id, message });
    } catch (err) {
      // Race: the partial unique index fires if two requests land at once.
      if (isUniqueViolation(err)) {
        throw new HttpError(409, 'request_already_pending', 'Você já tem uma solicitação pendente para esta clínica.');
      }
      throw err;
    }

    await safeAudit('clinic.join_request.created.success', user.id, clinic.id, row.id, ctx);
    return toMyJoinRequest({ ...row, clinic_name: clinic.nome });
  },

  async listMine(actor: JoinRequestUserActor): Promise<MyJoinRequest[]> {
    const rows = await clinicJoinRequestDao.listByUser(actor.usuario_id);
    return rows.map(toMyJoinRequest);
  },

  async cancelMine(actor: JoinRequestUserActor, id: string, ctx: AuthContext): Promise<MyJoinRequest> {
    const req = await clinicJoinRequestDao.findByIdForUser(id, actor.usuario_id);
    if (!req) throw new HttpError(404, 'request_not_found', 'Solicitação não encontrada.');
    if (req.status !== 'pending') {
      throw new HttpError(409, 'invalid_state', 'Esta solicitação não está pendente.');
    }
    const updated = await clinicJoinRequestDao.setStatus(id, 'cancelled', actor.usuario_id);
    if (!updated) throw new HttpError(404, 'request_not_found', 'Solicitação não encontrada.');
    await safeAudit('clinic.join_request.cancelled.success', actor.usuario_id, req.clinic_id, req.id, ctx);
    const clinic = await clinicDao.findById(req.clinic_id);
    return toMyJoinRequest({ ...updated, clinic_name: clinic?.nome ?? '' });
  },

  // Owner: pending requests for their own clinic only.
  async listPending(actor: ClinicOwnerActor): Promise<PendingJoinRequest[]> {
    const rows = await clinicJoinRequestDao.listPendingForClinic(actor.clinica_id);
    return rows.map(toPendingJoinRequest);
  },

  // Owner approves: applicant joins the clinic as 'secretaria'. Atomic. A request
  // from another clinic yields a generic 404 (no cross-tenant action).
  async approve(actor: ClinicOwnerActor, id: string, ctx: AuthContext): Promise<{ status: 'approved' }> {
    const req = await clinicJoinRequestDao.findByIdForClinic(id, actor.clinica_id);
    if (!req) throw new HttpError(404, 'request_not_found', 'Solicitação não encontrada.');
    if (req.status !== 'pending') {
      throw new HttpError(409, 'invalid_state', 'Esta solicitação não está pendente.');
    }
    // Defense in depth (DB CHECK also guarantees this): never grant a non-secretaria role.
    if (req.requested_role !== 'secretaria') {
      throw new HttpError(400, 'invalid_role', 'Papel solicitado inválido.');
    }

    const applicant = await userDao.findById(req.user_id);
    if (!applicant || !applicant.ativo) {
      throw new HttpError(409, 'applicant_unavailable', 'Solicitante indisponível.');
    }
    if (applicant.clinica_id) {
      throw new HttpError(409, 'applicant_already_in_clinic', 'O solicitante já pertence a uma clínica.');
    }

    await db.transaction(async (trx) => {
      await clinicJoinRequestDao.setStatus(id, 'approved', actor.usuario_id, trx);
      // papel is already 'secretaria' (set at staff registration); grant the clinic.
      await userDao.setClinic(req.user_id, actor.clinica_id, trx);
      // Other pending requests of this user can no longer be approved — cancel them.
      await clinicJoinRequestDao.cancelOtherPending(req.user_id, id, trx);
    });

    await safeAudit('clinic.join_request.approved.success', actor.usuario_id, actor.clinica_id, req.id, ctx);
    return { status: 'approved' };
  },

  async reject(actor: ClinicOwnerActor, id: string, ctx: AuthContext): Promise<{ status: 'rejected' }> {
    const req = await clinicJoinRequestDao.findByIdForClinic(id, actor.clinica_id);
    if (!req) throw new HttpError(404, 'request_not_found', 'Solicitação não encontrada.');
    if (req.status !== 'pending') {
      throw new HttpError(409, 'invalid_state', 'Esta solicitação não está pendente.');
    }
    await clinicJoinRequestDao.setStatus(id, 'rejected', actor.usuario_id);
    await safeAudit('clinic.join_request.rejected.success', actor.usuario_id, actor.clinica_id, req.id, ctx);
    return { status: 'rejected' };
  },
};
