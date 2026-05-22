import { env } from '../config/env';
import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import { patientDao } from '../dao/patientDao';
import { HttpError } from '../middlewares/errorHandler';
import { toPublicPatient, type PublicPatient } from '../models/patient';
import type { AuthContext } from './authService';

export interface PatientListActor {
  clinica_id: string;
  usuario_id: string;
}

// Raw query params as Express delivers them (string | string[] | undefined).
export interface RawPatientListQuery {
  search?: unknown;
  limit?: unknown;
  offset?: unknown;
}

export interface PatientListResult {
  patients: PublicPatient[];
  pagination: {
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

const SEARCH_MAX_LENGTH = 120;

// Parses a non-negative integer query param. Returns the fallback when absent;
// throws 400 invalid_pagination on anything that isn't a clean integer.
function parseIntParam(value: unknown, field: string, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new HttpError(400, 'invalid_pagination', `Parâmetro de paginação inválido: ${field}.`);
  }
  return Number(value);
}

function normalizeSearch(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  // Cap the term length defensively; never log the term (it may be PII).
  return trimmed.slice(0, SEARCH_MAX_LENGTH);
}

async function safeAudit(actor: PatientListActor, ctx: AuthContext): Promise<void> {
  try {
    await auditLogDao.create({
      acao: 'patient.list.success',
      usuario_id: actor.usuario_id,
      clinica_id: actor.clinica_id,
      recurso: 'patient',
      recurso_id: null,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
    });
  } catch (err) {
    logger.error(
      { err, acao: 'patient.list.success', audit_write_failed: true },
      'audit log write failed',
    );
  }
}

export const patientService = {
  // Lists administrative patients for the actor's clinic only. Read-only.
  // Validates pagination, masks the CPF, and NEVER returns raw CPF or any
  // clinical data (none exists in the MVP).
  async listForClinic(
    actor: PatientListActor,
    rawQuery: RawPatientListQuery,
    ctx: AuthContext,
  ): Promise<PatientListResult> {
    const limit = parseIntParam(rawQuery.limit, 'limit', env.PATIENTS_LIST_DEFAULT_LIMIT);
    const offset = parseIntParam(rawQuery.offset, 'offset', 0);

    if (limit < 1 || limit > env.PATIENTS_LIST_MAX_LIMIT) {
      throw new HttpError(
        400,
        'invalid_pagination',
        `O limite deve estar entre 1 e ${env.PATIENTS_LIST_MAX_LIMIT}.`,
      );
    }

    const search = normalizeSearch(rawQuery.search);

    // Fetch one extra row to derive has_more without a separate COUNT(*).
    const rows = await patientDao.listPatientsByClinic(actor.clinica_id, {
      limit: limit + 1,
      offset,
      search,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    await safeAudit(actor, ctx);

    return {
      patients: page.map(toPublicPatient),
      pagination: { limit, offset, has_more: hasMore },
    };
  },
};
