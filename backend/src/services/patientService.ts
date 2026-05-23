import { env } from '../config/env';
import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import { patientDao, type UpdatePatientFields } from '../dao/patientDao';
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
  status?: unknown;
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

async function auditPatient(
  acao: string,
  actor: PatientListActor,
  ctx: AuthContext,
  recurso_id: string | null = null,
): Promise<void> {
  try {
    await auditLogDao.create({
      acao,
      usuario_id: actor.usuario_id,
      clinica_id: actor.clinica_id,
      recurso: 'patient',
      // Patient id is a non-PII UUID; safe to record. No field values are logged.
      recurso_id,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
    });
  } catch (err) {
    logger.error({ err, acao, audit_write_failed: true }, 'audit log write failed');
  }
}

// --- Manual patient input validation (Sprint 3.22) ---------------------------
// Administrative fields ONLY. Mirrors the import's checks (CPF 11 digits, e-mail
// shape, date formats). NEVER echoes the offending value in the error message
// (no PII leak). Clinical data is out of scope and has no fields here.

const NAME_MAX = 200;
const PHONE_MAX = 40;
const EMAIL_MAX = 180;
const CONVENIO_MAX = 120;
const CARTEIRINHA_MAX = 60;
const EMAIL_RE = /^\S+@\S+\.\S+$/;

function invalidPatient(message: string): HttpError {
  return new HttpError(400, 'patient_invalid', message);
}

// Generic 404 used for both "doesn't exist" and "belongs to another clinic", so
// a cross-tenant probe can't distinguish the two (no tenant enumeration).
function patientNotFound(): HttpError {
  return new HttpError(404, 'patient_not_found', 'Paciente não encontrado.');
}

function asOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw invalidPatient('Campo em formato inválido.');
  return value;
}

function normName(value: unknown): string {
  const s = asOptionalString(value);
  const t = (s ?? '').trim();
  if (t.length === 0) throw invalidPatient('Informe o nome do paciente.');
  if (t.length > NAME_MAX) throw invalidPatient('Nome muito longo.');
  return t;
}

function normText(value: unknown, max: number, label: string): string | null {
  const s = asOptionalString(value);
  if (s === undefined) return null;
  const t = s.trim();
  if (t === '') return null;
  if (t.length > max) throw invalidPatient(`${label} muito longo.`);
  return t;
}

function normEmail(value: unknown): string | null {
  const t = normText(value, EMAIL_MAX, 'E-mail');
  if (t === null) return null;
  if (!EMAIL_RE.test(t)) throw invalidPatient('E-mail em formato inválido.');
  return t;
}

function normCpf(value: unknown): string | null {
  const s = asOptionalString(value);
  if (s === undefined) return null;
  const t = s.trim();
  if (t === '') return null;
  const digits = t.replace(/\D/g, '');
  if (digits.length !== 11) throw invalidPatient('CPF deve ter 11 dígitos.');
  return digits;
}

// Accepts 'YYYY-MM-DD' or 'DD/MM/YYYY' (also '.'/'-' separators); returns a
// normalized 'YYYY-MM-DD'. Rejects impossible and future dates.
function normBirthDate(value: unknown): string | null {
  const s = asOptionalString(value);
  if (s === undefined) return null;
  const t = s.trim();
  if (t === '') return null;
  let y: number;
  let mo: number;
  let d: number;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t))) {
    y = +m[1];
    mo = +m[2];
    d = +m[3];
  } else if ((m = /^(\d{2})[/.-](\d{2})[/.-](\d{4})$/.exec(t))) {
    d = +m[1];
    mo = +m[2];
    y = +m[3];
  } else {
    throw invalidPatient('Data de nascimento inválida (use AAAA-MM-DD ou DD/MM/AAAA).');
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) {
    throw invalidPatient('Data de nascimento inválida.');
  }
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    throw invalidPatient('Data de nascimento inválida.');
  }
  if (dt.getTime() > Date.now()) {
    throw invalidPatient('Data de nascimento não pode estar no futuro.');
  }
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function asObject(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw invalidPatient('Dados do paciente inválidos.');
  }
  return raw as Record<string, unknown>;
}

interface NormalizedPatientFields {
  nome: string;
  telefone: string | null;
  email: string | null;
  cpf: string | null;
  data_nascimento: string | null;
  convenio: string | null;
  numero_carteirinha: string | null;
}

function buildCreateInput(raw: unknown): NormalizedPatientFields {
  const r = asObject(raw);
  return {
    nome: normName(r.nome),
    telefone: normText(r.telefone, PHONE_MAX, 'Telefone'),
    email: normEmail(r.email),
    cpf: normCpf(r.cpf),
    data_nascimento: normBirthDate(r.data_nascimento),
    convenio: normText(r.convenio, CONVENIO_MAX, 'Convênio'),
    numero_carteirinha: normText(r.numero_carteirinha, CARTEIRINHA_MAX, 'Número da carteirinha'),
  };
}

// Partial update: only the keys actually present are validated and written.
function buildUpdateFields(raw: unknown): UpdatePatientFields {
  const r = asObject(raw);
  const out: UpdatePatientFields = {};
  if ('nome' in r) out.nome = normName(r.nome);
  if ('telefone' in r) out.telefone = normText(r.telefone, PHONE_MAX, 'Telefone');
  if ('email' in r) out.email = normEmail(r.email);
  if ('cpf' in r) out.cpf = normCpf(r.cpf);
  if ('data_nascimento' in r) out.data_nascimento = normBirthDate(r.data_nascimento);
  if ('convenio' in r) out.convenio = normText(r.convenio, CONVENIO_MAX, 'Convênio');
  if ('numero_carteirinha' in r) {
    out.numero_carteirinha = normText(r.numero_carteirinha, CARTEIRINHA_MAX, 'Número da carteirinha');
  }
  if (Object.keys(out).length === 0) {
    throw invalidPatient('Nenhum campo para atualizar.');
  }
  return out;
}

// Default listing shows only active patients; ?status=archived or ?status=all
// widen it. Returns the DAO status filter (null = no filter / all).
function parseStatusFilter(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return 'active';
  if (value === 'active' || value === 'archived' || value === 'inactive') return value;
  if (value === 'all') return null;
  throw new HttpError(400, 'invalid_status_filter', 'Filtro de status inválido.');
}

export const patientService = {
  // Lists administrative patients for the actor's clinic only. Read-only.
  // Validates pagination, masks the CPF, and NEVER returns raw CPF or any
  // clinical data (none exists in the MVP). Defaults to status='active' so
  // archived patients drop out of the listing AND the agenda picker (which
  // reuses this endpoint with no status); ?status=archived|inactive|all widen it.
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
    const status = parseStatusFilter(rawQuery.status);

    // Fetch one extra row to derive has_more without a separate COUNT(*).
    const rows = await patientDao.listPatientsByClinic(actor.clinica_id, {
      limit: limit + 1,
      offset,
      search,
      status,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    await auditPatient('patient.list.success', actor, ctx);

    return {
      patients: page.map(toPublicPatient),
      pagination: { limit, offset, has_more: hasMore },
    };
  },

  // Manual patient creation (Sprint 3.22). Administrative fields ONLY — clinical
  // data is out of scope. origem='manual'/status='active' are forced in the DAO.
  // Tenant comes from the authenticated actor; never from client input.
  async createForClinic(
    actor: PatientListActor,
    rawBody: unknown,
    ctx: AuthContext,
  ): Promise<PublicPatient> {
    const fields = buildCreateInput(rawBody);
    const row = await patientDao.create({ clinica_id: actor.clinica_id, ...fields });
    await auditPatient('patient.create.success', actor, ctx, row.id);
    return toPublicPatient(row);
  },

  // Tenant-scoped partial update of administrative fields. A cross-clinic id
  // (or missing) yields a generic 404 — no cross-tenant write or enumeration.
  async updateForClinic(
    actor: PatientListActor,
    id: string,
    rawBody: unknown,
    ctx: AuthContext,
  ): Promise<PublicPatient> {
    const fields = buildUpdateFields(rawBody);
    const row = await patientDao.updateForClinic(id, actor.clinica_id, fields);
    if (!row) throw patientNotFound();
    await auditPatient('patient.update.success', actor, ctx, row.id);
    return toPublicPatient(row);
  },

  // Soft-delete via status='archived'. Keeps the patient row and any
  // appointment history intact (no physical delete). Owner-only at the route.
  async archiveForClinic(
    actor: PatientListActor,
    id: string,
    ctx: AuthContext,
  ): Promise<PublicPatient> {
    const row = await patientDao.setStatusForClinic(id, actor.clinica_id, 'archived');
    if (!row) throw patientNotFound();
    await auditPatient('patient.archive.success', actor, ctx, row.id);
    return toPublicPatient(row);
  },

  // Restores an archived patient back to status='active'. Owner-only at the route.
  async restoreForClinic(
    actor: PatientListActor,
    id: string,
    ctx: AuthContext,
  ): Promise<PublicPatient> {
    const row = await patientDao.setStatusForClinic(id, actor.clinica_id, 'active');
    if (!row) throw patientNotFound();
    await auditPatient('patient.restore.success', actor, ctx, row.id);
    return toPublicPatient(row);
  },
};
