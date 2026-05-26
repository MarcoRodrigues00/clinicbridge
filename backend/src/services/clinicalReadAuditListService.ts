import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import {
  clinicalReadAuditDao,
  type ClinicalReadAuditListRow,
} from '../dao/clinicalReadAuditDao';
import { HttpError } from '../middlewares/errorHandler';
import type { AuthContext } from './authService';

// Owner identity. The route stack guarantees requireAuth + requireClinic +
// requireRole(CLINIC_ADMIN_ROLES) before this service is called; the service
// re-derives nothing from the HTTP layer directly.
export interface ClinicalReadAuditListActor {
  clinica_id: string;
  usuario_id: string;
}

// Allowlist of acao values the service accepts as filters (mirrors the
// ALLOWED_ACOES set in clinicalReadAuditService so the sets stay in sync).
const ALLOWED_ACAO_FILTERS = new Set<string>([
  'clinical.encounter.read',
  'clinical.encounter.list',
  'clinical.timeline.list',
]);

const LIST_DEFAULT_LIMIT = 50;
const LIST_MAX_LIMIT = 100;
const LIST_MAX_OFFSET = 10_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalidFilter(message: string): HttpError {
  return new HttpError(400, 'clinical_read_audit_filter_invalid', message);
}

function parseUuidFilter(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw invalidFilter(`Identificador inválido: ${field}.`);
  }
  return value;
}

function parseAcaoFilter(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !ALLOWED_ACAO_FILTERS.has(value)) {
    throw invalidFilter(
      `acao inválida. Use um de: ${[...ALLOWED_ACAO_FILTERS].join(', ')}.`,
    );
  }
  return value;
}

function parseDateFilter(value: unknown, field: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw invalidFilter(`${field} inválido.`);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw invalidFilter(`${field} inválido.`);
  return d;
}

function parseLimit(value: unknown): number {
  if (value === undefined || value === null || value === '') return LIST_DEFAULT_LIMIT;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw invalidFilter('limit inválido.');
  }
  const n = Number(value);
  if (n < 1 || n > LIST_MAX_LIMIT) {
    throw invalidFilter(`limit deve estar entre 1 e ${LIST_MAX_LIMIT}.`);
  }
  return n;
}

function parseOffset(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw invalidFilter('offset inválido.');
  }
  const n = Number(value);
  if (n < 0 || n > LIST_MAX_OFFSET) {
    throw invalidFilter('offset inválido.');
  }
  return n;
}

// Public shape for one audit entry. Excludes ip/user_agent — those are
// forensic metadata, not needed for basic LGPD transparency. Excludes all
// clinical content fields (none were ever stored in this table by design).
export interface PublicClinicalReadAuditEntry {
  id: string;
  acao: string;
  recurso: string;
  recurso_id: string | null;
  // Pseudonymized patient UUID. Included so the owner can correlate events;
  // the joined paciente_nome provides the human-readable display.
  paciente_id: string | null;
  paciente_nome: string | null;
  usuario_id: string | null;
  usuario_nome: string | null;
  usuario_email: string | null;
  papel_at_read: string;
  request_id: string | null;
  criado_em: Date;
}

function toPublic(row: ClinicalReadAuditListRow): PublicClinicalReadAuditEntry {
  return {
    id: row.id,
    acao: row.acao,
    recurso: row.recurso,
    recurso_id: row.recurso_id,
    paciente_id: row.paciente_id,
    paciente_nome: row.paciente_nome,
    usuario_id: row.usuario_id,
    usuario_nome: row.usuario_nome,
    usuario_email: row.usuario_email,
    papel_at_read: row.papel_at_read,
    request_id: row.request_id,
    criado_em: row.criado_em,
  };
}

export const clinicalReadAuditListService = {
  async list(
    actor: ClinicalReadAuditListActor,
    rawQuery: {
      patient_id?: unknown;
      user_id?: unknown;
      acao?: unknown;
      date_from?: unknown;
      date_to?: unknown;
      limit?: unknown;
      offset?: unknown;
    },
    ctx: AuthContext,
  ): Promise<{ audits: PublicClinicalReadAuditEntry[] }> {
    const patient_id = parseUuidFilter(rawQuery.patient_id, 'patient_id');
    const user_id = parseUuidFilter(rawQuery.user_id, 'user_id');
    const acao = parseAcaoFilter(rawQuery.acao);
    const date_from = parseDateFilter(rawQuery.date_from, 'date_from');
    const date_to = parseDateFilter(rawQuery.date_to, 'date_to');
    if (date_from && date_to && date_to.getTime() <= date_from.getTime()) {
      throw invalidFilter('date_to deve ser maior que date_from.');
    }
    const limit = parseLimit(rawQuery.limit);
    const offset = parseOffset(rawQuery.offset);

    const rows = await clinicalReadAuditDao.list(actor.clinica_id, {
      patient_id,
      user_id,
      acao,
      date_from,
      date_to,
      limit,
      offset,
    });

    // Best-effort administrative audit. Never logs PII or content — only the
    // fact that the owner listed audit events, which is itself auditable.
    try {
      await auditLogDao.create({
        acao: 'clinical_read_audit.list.success',
        usuario_id: actor.usuario_id,
        clinica_id: actor.clinica_id,
        recurso: 'clinical_read_audit',
        recurso_id: null,
        ip: ctx.ip,
        user_agent: ctx.user_agent,
        request_id: ctx.request_id,
      });
    } catch (err) {
      logger.error(
        { err, acao: 'clinical_read_audit.list.success', audit_write_failed: true },
        'audit log write failed',
      );
    }

    return { audits: rows.map(toPublic) };
  },
};
