import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import {
  clinicServiceDao,
  professionalServiceDao,
} from '../dao/clinicServiceDao';
import { clinicProfessionalDao } from '../dao/clinicProfessionalDao';
import { HttpError } from '../middlewares/errorHandler';
import type { ClinicServiceRow, ProfessionalServiceRow } from '../types/db';
import type { AuthContext } from './authService';

// Catálogo de Serviços v0.1 — Sprint 4.6B (ADR 0015).
//
// ADMINISTRATIVE / COMMERCIAL module. Routes use `requireRole` (not
// `requireClinicalRole`). Profissional_clinico can READ the catalog (selector
// in agenda); only dono_clinica can MUTATE (catalog is a pricing-table
// decision).
//
// Field-level invariants enforced HERE (defense in depth — DB CHECK already
// catches violations, but the service produces clean 400 codes):
//   - name: trim, 1..120 chars, UNIQUE per clinic.
//   - category: trim or null, <= 80 chars.
//   - description: trim or null, <= 500 chars.
//   - duration_minutes: integer 5..720, or null.
//   - price_cents: integer 0..99_999_999, or null.
//
// NEVER mutates from this service:
//   - clinica_id, id, created_at.
// NEVER auto-propagates:
//   - price_cents to financial_charges.amount_cents.
//   - duration_minutes to appointments.ends_at - starts_at.

export interface CatalogActor {
  clinica_id: string;
  usuario_id: string;
}

// ----- Validation constants -------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NAME_MIN = 1;
const NAME_MAX = 120;
const CATEGORY_MAX = 80;
const DESCRIPTION_MAX = 500;
const DURATION_MIN = 5;
const DURATION_MAX = 720;
const PRICE_MAX = 99_999_999;

const LIST_DEFAULT_LIMIT = 50;
const LIST_MAX_LIMIT = 100;
const LIST_MAX_OFFSET = 10_000;

// ----- Error helpers --------------------------------------------------------

function invalid(message: string): HttpError {
  return new HttpError(400, 'clinic_service_invalid', message);
}

function serviceNotFound(): HttpError {
  return new HttpError(404, 'service_not_found', 'Serviço não encontrado.');
}

function professionalNotFound(): HttpError {
  return new HttpError(404, 'professional_not_found', 'Profissional não encontrado.');
}

function duplicateName(): HttpError {
  return new HttpError(
    409,
    'service_name_duplicated',
    'Já existe um serviço com esse nome nesta clínica.',
  );
}

function bindingNotFound(): HttpError {
  return new HttpError(
    404,
    'professional_service_link_not_found',
    'Vínculo entre profissional e serviço não encontrado.',
  );
}

// ----- Parsers --------------------------------------------------------------

function parseUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw invalid(`Identificador inválido: ${field}.`);
  }
  return value;
}

function parseName(value: unknown): string {
  if (typeof value !== 'string') throw invalid('name é obrigatório.');
  const trimmed = value.trim();
  if (trimmed.length < NAME_MIN) throw invalid('name é obrigatório.');
  if (trimmed.length > NAME_MAX) {
    throw invalid(`name deve ter no máximo ${NAME_MAX} caracteres.`);
  }
  return trimmed;
}

function parseOptionalCategory(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw invalid('category inválido.');
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > CATEGORY_MAX) {
    throw invalid(`category deve ter no máximo ${CATEGORY_MAX} caracteres.`);
  }
  return trimmed;
}

function parseOptionalDescription(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw invalid('description inválido.');
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > DESCRIPTION_MAX) {
    throw invalid(`description deve ter no máximo ${DESCRIPTION_MAX} caracteres.`);
  }
  return trimmed;
}

function parseOptionalDuration(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw invalid('duration_minutes deve ser um inteiro.');
  }
  if (value < DURATION_MIN || value > DURATION_MAX) {
    throw invalid(`duration_minutes deve estar entre ${DURATION_MIN} e ${DURATION_MAX}.`);
  }
  return value;
}

function parseOptionalPrice(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw invalid('price_cents deve ser um inteiro.');
  }
  if (value < 0 || value > PRICE_MAX) {
    throw invalid(`price_cents deve estar entre 0 e ${PRICE_MAX}.`);
  }
  return value;
}

function parseActiveFilter(value: unknown): boolean | null {
  if (value === undefined || value === null || value === '') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw invalid('Filtro active deve ser true ou false.');
}

function parseActiveBody(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw invalid('active deve ser booleano.');
  }
  return value;
}

function parseLimit(value: unknown): number {
  if (value === undefined || value === null || value === '') return LIST_DEFAULT_LIMIT;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw invalid('limit inválido.');
  }
  const n = Number(value);
  if (n < 1 || n > LIST_MAX_LIMIT) {
    throw invalid(`limit deve estar entre 1 e ${LIST_MAX_LIMIT}.`);
  }
  return n;
}

function parseOffset(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw invalid('offset inválido.');
  }
  const n = Number(value);
  if (n < 0 || n > LIST_MAX_OFFSET) {
    throw invalid(`offset deve estar entre 0 e ${LIST_MAX_OFFSET}.`);
  }
  return n;
}

// ----- Audit ----------------------------------------------------------------

// Audit is METADATA-ONLY (ADR 0015 §2.14). NEVER includes name, description,
// category, price_cents, or any field of the body. recurso_id is the entity id.
async function safeAudit(
  acao: string,
  recurso_id: string | null,
  actor: CatalogActor,
  ctx: AuthContext,
): Promise<void> {
  try {
    await auditLogDao.create({
      acao,
      usuario_id: actor.usuario_id,
      clinica_id: actor.clinica_id,
      recurso: 'clinic_service',
      recurso_id,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
    });
  } catch (err) {
    // Best-effort write — mirrors financialChargeService.safeAudit (the row
    // already exists at this point; an audit miss does not roll the write back).
    logger.error({ err, acao, audit_write_failed: true }, 'audit log write failed');
  }
}

// ----- Projections ----------------------------------------------------------

export interface PublicClinicService {
  id: string;
  clinica_id: string;
  name: string;
  category: string | null;
  description: string | null;
  duration_minutes: number | null;
  price_cents: number | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

function toPublicService(row: ClinicServiceRow): PublicClinicService {
  return {
    id: row.id,
    clinica_id: row.clinica_id,
    name: row.name,
    category: row.category,
    description: row.description,
    duration_minutes: row.duration_minutes,
    price_cents: row.price_cents,
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface PublicProfessionalServiceLink {
  professional_id: string;
  service_id: string;
  clinica_id: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

function toPublicLink(row: ProfessionalServiceRow): PublicProfessionalServiceLink {
  return {
    professional_id: row.professional_id,
    service_id: row.service_id,
    clinica_id: row.clinica_id,
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ----- Unique-violation detection -------------------------------------------

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

// ----- Service --------------------------------------------------------------

export const clinicServiceService = {
  // GET /clinic-services
  // Lists services of the actor's clinic. Allowed for dono + secretaria (any
  // clinical grant inherits via papel='secretaria'). The agenda selector in
  // the frontend uses ?active=true to suppress soft-deleted rows.
  async list(
    actor: CatalogActor,
    rawQuery: { active?: unknown; limit?: unknown; offset?: unknown },
  ): Promise<{ services: PublicClinicService[] }> {
    const active = parseActiveFilter(rawQuery.active);
    const limit = parseLimit(rawQuery.limit);
    const offset = parseOffset(rawQuery.offset);
    const rows = await clinicServiceDao.listForClinic(actor.clinica_id, {
      active,
      limit,
      offset,
    });
    return { services: rows.map(toPublicService) };
  },

  // GET /clinic-services/:id
  async findById(
    actor: CatalogActor,
    id_param: string,
  ): Promise<{ service: PublicClinicService }> {
    const id = parseUuid(id_param, 'id');
    const row = await clinicServiceDao.findByIdForClinic(id, actor.clinica_id);
    if (!row) throw serviceNotFound();
    return { service: toPublicService(row) };
  },

  // POST /clinic-services — dono_clinica only at the route.
  async create(
    actor: CatalogActor,
    body: {
      name?: unknown;
      category?: unknown;
      description?: unknown;
      duration_minutes?: unknown;
      price_cents?: unknown;
    },
    ctx: AuthContext,
  ): Promise<{ service: PublicClinicService }> {
    const name = parseName(body.name);
    const category = parseOptionalCategory(body.category);
    const description = parseOptionalDescription(body.description);
    const duration_minutes = parseOptionalDuration(body.duration_minutes);
    const price_cents = parseOptionalPrice(body.price_cents);

    // Pre-check duplicate so we can return 409 with a clean message before the
    // INSERT. The DB UNIQUE constraint is the real guard against the race
    // window — handled in the catch below.
    const existing = await clinicServiceDao.findByNameForClinic(actor.clinica_id, name);
    if (existing) throw duplicateName();

    let row: ClinicServiceRow;
    try {
      row = await clinicServiceDao.create({
        clinica_id: actor.clinica_id,
        name,
        category,
        description,
        duration_minutes,
        price_cents,
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateName();
      throw err;
    }

    await safeAudit('clinic_service.create.success', row.id, actor, ctx);
    return { service: toPublicService(row) };
  },

  // PATCH /clinic-services/:id — dono_clinica only. Does NOT touch `active`
  // (status endpoint handles that explicitly).
  async update(
    actor: CatalogActor,
    id_param: string,
    body: {
      name?: unknown;
      category?: unknown;
      description?: unknown;
      duration_minutes?: unknown;
      price_cents?: unknown;
    },
    ctx: AuthContext,
  ): Promise<{ service: PublicClinicService }> {
    const id = parseUuid(id_param, 'id');

    const existing = await clinicServiceDao.findByIdForClinic(id, actor.clinica_id);
    if (!existing) throw serviceNotFound();

    const patch: {
      name?: string;
      category?: string | null;
      description?: string | null;
      duration_minutes?: number | null;
      price_cents?: number | null;
    } = {};
    if (body.name !== undefined) patch.name = parseName(body.name);
    if (body.category !== undefined) patch.category = parseOptionalCategory(body.category);
    if (body.description !== undefined) {
      patch.description = parseOptionalDescription(body.description);
    }
    if (body.duration_minutes !== undefined) {
      patch.duration_minutes = parseOptionalDuration(body.duration_minutes);
    }
    if (body.price_cents !== undefined) {
      patch.price_cents = parseOptionalPrice(body.price_cents);
    }
    if (Object.keys(patch).length === 0) {
      throw invalid('Nenhum campo para atualizar.');
    }

    // Same-name pre-check (skip when name unchanged or absent).
    if (patch.name !== undefined && patch.name !== existing.name) {
      const dup = await clinicServiceDao.findByNameForClinic(actor.clinica_id, patch.name);
      if (dup && dup.id !== id) throw duplicateName();
    }

    let updated: ClinicServiceRow | undefined;
    try {
      updated = await clinicServiceDao.updateForClinic(id, actor.clinica_id, patch);
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateName();
      throw err;
    }
    if (!updated) throw serviceNotFound();

    await safeAudit('clinic_service.update.success', updated.id, actor, ctx);
    return { service: toPublicService(updated) };
  },

  // PATCH /clinic-services/:id/status — dono_clinica only. Soft-delete /
  // reactivate via `active` flag. Historical agendamentos and financial_charges
  // keep their service_id reference (they show a deactivated label).
  async updateStatus(
    actor: CatalogActor,
    id_param: string,
    body: { active?: unknown },
    ctx: AuthContext,
  ): Promise<{ service: PublicClinicService }> {
    const id = parseUuid(id_param, 'id');
    const active = parseActiveBody(body.active);

    const row = await clinicServiceDao.updateStatus(id, actor.clinica_id, active);
    if (!row) throw serviceNotFound();

    await safeAudit('clinic_service.status.update.success', row.id, actor, ctx);
    return { service: toPublicService(row) };
  },

  // GET /clinic-services/:id/professionals — list bindings for a service.
  // Allowed for dono + secretaria (frontend agenda selector consumes this to
  // filter the service dropdown by professional).
  async listProfessionals(
    actor: CatalogActor,
    id_param: string,
    rawQuery: { active?: unknown },
  ): Promise<{ links: PublicProfessionalServiceLink[] }> {
    const service_id = parseUuid(id_param, 'id');
    const active = parseActiveFilter(rawQuery.active);

    // Cross-tenant probe is caught here — generic 404.
    const service = await clinicServiceDao.findByIdForClinic(service_id, actor.clinica_id);
    if (!service) throw serviceNotFound();

    const rows = await professionalServiceDao.listByService(
      actor.clinica_id,
      service_id,
      { active },
    );
    return { links: rows.map(toPublicLink) };
  },

  // POST /clinic-services/:id/professionals — dono_clinica only. Validates
  // BOTH the service and the professional belong to the actor's clinic (the
  // FK alone enforces existence, not tenant). Re-linking an existing pair
  // flips active=true (no duplicate row).
  async linkProfessional(
    actor: CatalogActor,
    id_param: string,
    body: { professional_id?: unknown },
    ctx: AuthContext,
  ): Promise<{ link: PublicProfessionalServiceLink }> {
    const service_id = parseUuid(id_param, 'id');
    const professional_id = parseUuid(body.professional_id, 'professional_id');

    const service = await clinicServiceDao.findByIdForClinic(service_id, actor.clinica_id);
    if (!service) throw serviceNotFound();

    const prof = await clinicProfessionalDao.findByIdForClinic(
      professional_id,
      actor.clinica_id,
    );
    if (!prof) throw professionalNotFound();

    // Idempotent rebind: flip active back to true on an existing pair.
    const existing = await professionalServiceDao.findBinding(
      actor.clinica_id,
      professional_id,
      service_id,
    );
    let row: ProfessionalServiceRow;
    if (existing) {
      if (!existing.active) {
        const updated = await professionalServiceDao.updateStatus(
          actor.clinica_id,
          professional_id,
          service_id,
          true,
        );
        if (!updated) throw bindingNotFound();
        row = updated;
      } else {
        row = existing;
      }
    } else {
      row = await professionalServiceDao.create({
        clinica_id: actor.clinica_id,
        professional_id,
        service_id,
      });
    }

    await safeAudit('clinic_service.professional.link.success', service_id, actor, ctx);
    return { link: toPublicLink(row) };
  },

  // PATCH /clinic-services/:id/professionals/:professional_id/status — dono only.
  async updateProfessionalLinkStatus(
    actor: CatalogActor,
    service_id_param: string,
    professional_id_param: string,
    body: { active?: unknown },
    ctx: AuthContext,
  ): Promise<{ link: PublicProfessionalServiceLink }> {
    const service_id = parseUuid(service_id_param, 'id');
    const professional_id = parseUuid(professional_id_param, 'professional_id');
    const active = parseActiveBody(body.active);

    // Verify tenant via the service row (also catches non-existent service).
    const service = await clinicServiceDao.findByIdForClinic(service_id, actor.clinica_id);
    if (!service) throw serviceNotFound();

    const updated = await professionalServiceDao.updateStatus(
      actor.clinica_id,
      professional_id,
      service_id,
      active,
    );
    if (!updated) throw bindingNotFound();

    await safeAudit(
      'clinic_service.professional.status.update.success',
      service_id,
      actor,
      ctx,
    );
    return { link: toPublicLink(updated) };
  },
};
