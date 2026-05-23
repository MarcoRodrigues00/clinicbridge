import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import { clinicProfessionalDao } from '../dao/clinicProfessionalDao';
import { HttpError } from '../middlewares/errorHandler';
import {
  toPublicClinicProfessional,
  type PublicClinicProfessional,
} from '../models/clinicProfessional';
import type { AuthContext } from './authService';

export interface SchedulingActor {
  clinica_id: string;
  usuario_id: string;
}

const NAME_MAX = 200;
const SPECIALTY_MAX = 120;

function normalizeName(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, 'invalid_professional', 'O nome do profissional é obrigatório.');
  }
  const trimmed = value.trim();
  if (trimmed.length > NAME_MAX) {
    throw new HttpError(400, 'invalid_professional', `O nome deve ter no máximo ${NAME_MAX} caracteres.`);
  }
  return trimmed;
}

// Optional administrative label. Empty/whitespace -> null. NOT clinical data.
function normalizeSpecialty(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new HttpError(400, 'invalid_professional', 'specialty_label inválido.');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > SPECIALTY_MAX) {
    throw new HttpError(
      400,
      'invalid_professional',
      `specialty_label deve ter no máximo ${SPECIALTY_MAX} caracteres.`,
    );
  }
  return trimmed;
}

function parseActiveFilter(value: unknown): boolean | null {
  if (value === undefined || value === '') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new HttpError(400, 'invalid_filter', 'O filtro active deve ser true ou false.');
}

async function safeAudit(
  acao: string,
  recurso_id: string | null,
  actor: SchedulingActor,
  ctx: AuthContext,
): Promise<void> {
  try {
    await auditLogDao.create({
      acao,
      usuario_id: actor.usuario_id,
      clinica_id: actor.clinica_id,
      recurso: 'clinic_professional',
      recurso_id,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
    });
  } catch (err) {
    logger.error({ err, acao, audit_write_failed: true }, 'audit log write failed');
  }
}

export const clinicProfessionalService = {
  // Owner-only (gated at the route). Creates an administrative professional.
  async create(
    actor: SchedulingActor,
    input: { name: unknown; specialty_label?: unknown },
    ctx: AuthContext,
  ): Promise<PublicClinicProfessional> {
    const name = normalizeName(input.name);
    const specialty_label = normalizeSpecialty(input.specialty_label);

    const row = await clinicProfessionalDao.create({
      clinica_id: actor.clinica_id,
      name,
      specialty_label,
    });
    await safeAudit('clinic_professional.create.success', row.id, actor, ctx);
    return toPublicClinicProfessional(row);
  },

  // Owner + secretaria. Lists professionals of the actor's clinic only.
  async list(
    actor: SchedulingActor,
    rawQuery: { active?: unknown },
  ): Promise<{ professionals: PublicClinicProfessional[] }> {
    const active = parseActiveFilter(rawQuery.active);
    const rows = await clinicProfessionalDao.listByClinic(actor.clinica_id, { active });
    // Not audited: this list carries administrative labels only (no patient PII).
    return { professionals: rows.map(toPublicClinicProfessional) };
  },

  // Owner-only. Updates name/specialty_label/is_active. 404 when the id is not in
  // the actor's clinic (no cross-tenant write).
  async update(
    actor: SchedulingActor,
    id: string,
    input: { name?: unknown; specialty_label?: unknown; is_active?: unknown },
    ctx: AuthContext,
  ): Promise<PublicClinicProfessional> {
    const fields: { name?: string; specialty_label?: string | null; is_active?: boolean } = {};
    if (input.name !== undefined) fields.name = normalizeName(input.name);
    if (input.specialty_label !== undefined) {
      fields.specialty_label = normalizeSpecialty(input.specialty_label);
    }
    if (input.is_active !== undefined) {
      if (typeof input.is_active !== 'boolean') {
        throw new HttpError(400, 'invalid_professional', 'is_active deve ser booleano.');
      }
      fields.is_active = input.is_active;
    }
    if (Object.keys(fields).length === 0) {
      throw new HttpError(400, 'invalid_professional', 'Nenhum campo para atualizar.');
    }

    const row = await clinicProfessionalDao.updateForClinic(id, actor.clinica_id, fields);
    if (!row) {
      throw new HttpError(404, 'professional_not_found', 'Profissional não encontrado.');
    }
    await safeAudit('clinic_professional.update.success', row.id, actor, ctx);
    return toPublicClinicProfessional(row);
  },

  // Owner-only. Soft action: sets is_active=false (no physical delete).
  async deactivate(
    actor: SchedulingActor,
    id: string,
    ctx: AuthContext,
  ): Promise<PublicClinicProfessional> {
    const row = await clinicProfessionalDao.updateForClinic(id, actor.clinica_id, {
      is_active: false,
    });
    if (!row) {
      throw new HttpError(404, 'professional_not_found', 'Profissional não encontrado.');
    }
    await safeAudit('clinic_professional.deactivate.success', row.id, actor, ctx);
    return toPublicClinicProfessional(row);
  },
};
