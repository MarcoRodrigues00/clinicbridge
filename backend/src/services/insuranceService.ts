import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import { clinicServiceDao } from '../dao/clinicServiceDao';
import { insurancePlanDao } from '../dao/insurancePlanDao';
import { insuranceProviderDao } from '../dao/insuranceProviderDao';
import { patientDao } from '../dao/patientDao';
import { patientInsuranceDao } from '../dao/patientInsuranceDao';
import { serviceInsurancePriceDao } from '../dao/serviceInsurancePriceDao';
import { userClinicalRoleDao } from '../dao/userClinicalRoleDao';
import { HttpError } from '../middlewares/errorHandler';
import type {
  InsurancePlanRow,
  InsuranceProviderRow,
  PatientInsuranceRow,
  ServiceInsurancePriceRow,
  UserClinicalRoleName,
} from '../types/db';
import type { AuthContext } from './authService';

// Convênios v0.1 — Sprint 4.7B (ADR 0016).
//
// ADMINISTRATIVE / COMMERCIAL module. Routes use `requireRole` (NOT
// `requireClinicalRole`). The fine-grained policy is split between the routes
// and this service:
//
//   - insurance_providers / insurance_plans / service_insurance_prices:
//     writes restricted to CLINIC_ADMIN_ROLES = ['dono_clinica'] at the route.
//     Reads open to dono_clinica + secretaria at the route.
//
//   - patient_insurances:
//     reads/writes open to dono_clinica + secretaria at the route.
//
//   - Service-layer block: `assertNotProfissional(actor)` runs at the start of
//     EVERY method (ADR 0016 §4). A user whose JWT has papel='secretaria' but
//     who carries the clinical grant `profissional_clinico` is rejected with
//     403 across the whole convênios surface — mirrors `effectiveFinancialAccess`
//     in financialChargeService. Pure secretaria + gestor_clinica pass through.
//
// Same-clinic validation of provider_id / plan_id / patient_id / service_id is
// enforced HERE (the FK alone doesn't enforce tenant).
//
// PII (member_number, holder_name):
//   - Stored raw.
//   - Returned MASKED in list payloads (member_number_masked = "****1234").
//   - Returned RAW in detail payloads (single record) — the operator clicked
//     into the record explicitly. Detail audit is metadata-only as usual.
//   - Logger redacts both fields regardless (config/logger.ts; defense in depth).
//   - NEVER appears in audit_logs.acao or any audit textual field.
//
// reference_price_cents:
//   - NEVER read by the financial service to auto-populate amount_cents.
//   - UI may surface it as a visual hint; human still types the value.

// ============================================================================
// Common types
// ============================================================================

export interface InsuranceActorInput {
  clinica_id: string;
  usuario_id: string;
}

export interface InsuranceActor extends InsuranceActorInput {
  clinical_grants: Set<UserClinicalRoleName>;
}

// Load clinical role grants once per request — same pattern as
// `buildFinancialActor`. profissional_clinico is blocked entirely on convênios
// (ADR 0016 §4) even though the JWT carries papel='secretaria'.
export async function buildInsuranceActor(
  input: InsuranceActorInput,
): Promise<InsuranceActor> {
  const grants = await userClinicalRoleDao.listActiveRoleNames(
    input.usuario_id,
    input.clinica_id,
  );
  return {
    ...input,
    clinical_grants: new Set(grants),
  };
}

function assertNotProfissional(actor: InsuranceActor): void {
  if (actor.clinical_grants.has('profissional_clinico')) {
    throw new HttpError(
      403,
      'forbidden_role',
      'Profissional clínico não tem acesso à camada de convênios.',
    );
  }
}

// ----- Validation constants --------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PROVIDER_NAME_MAX = 200;
const PLAN_NAME_MAX = 150;
const MEMBER_NUMBER_MAX = 100;
const HOLDER_NAME_MAX = 200;
const NOTES_MAX = 500;
const REFERENCE_PRICE_MAX = 99_999_999;

const LIST_DEFAULT_LIMIT = 50;
const LIST_MAX_LIMIT = 100;
const LIST_MAX_OFFSET = 10_000;

const PAYER_TYPES = ['private', 'insurance', 'mixed'] as const;
export type PayerType = (typeof PAYER_TYPES)[number];

// ----- Error helpers ---------------------------------------------------------

function invalid(message: string): HttpError {
  return new HttpError(400, 'insurance_invalid', message);
}

function providerNotFound(): HttpError {
  return new HttpError(404, 'insurance_provider_not_found', 'Operadora não encontrada.');
}

function planNotFound(): HttpError {
  return new HttpError(404, 'insurance_plan_not_found', 'Plano de convênio não encontrado.');
}

function patientInsuranceNotFound(): HttpError {
  return new HttpError(
    404,
    'patient_insurance_not_found',
    'Convênio do paciente não encontrado.',
  );
}

function servicePriceNotFound(): HttpError {
  return new HttpError(
    404,
    'service_insurance_price_not_found',
    'Preço de referência não encontrado.',
  );
}

function patientNotFound(): HttpError {
  return new HttpError(404, 'patient_not_found', 'Paciente não encontrado.');
}

function serviceNotFound(): HttpError {
  return new HttpError(404, 'service_not_found', 'Serviço não encontrado.');
}

function duplicateProviderName(): HttpError {
  return new HttpError(
    409,
    'insurance_provider_name_duplicated',
    'Já existe uma operadora com esse nome nesta clínica.',
  );
}

function duplicatePlanName(): HttpError {
  return new HttpError(
    409,
    'insurance_plan_name_duplicated',
    'Já existe um plano com esse nome para esta operadora.',
  );
}

function duplicateServicePrice(): HttpError {
  return new HttpError(
    409,
    'service_insurance_price_duplicated',
    'Já existe um preço cadastrado para essa combinação de serviço, operadora e plano.',
  );
}

// ----- Parsers ---------------------------------------------------------------

function parseUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw invalid(`Identificador inválido: ${field}.`);
  }
  return value;
}

function parseOptionalUuid(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  return parseUuid(value, field);
}

function parseName(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') throw invalid(`${field} é obrigatório.`);
  const trimmed = value.trim();
  if (trimmed.length < 1) throw invalid(`${field} é obrigatório.`);
  if (trimmed.length > max) {
    throw invalid(`${field} deve ter no máximo ${max} caracteres.`);
  }
  return trimmed;
}

function parseOptionalText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw invalid(`${field} inválido.`);
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > max) {
    throw invalid(`${field} deve ter no máximo ${max} caracteres.`);
  }
  return trimmed;
}

function parseOptionalNotes(value: unknown): string | null {
  return parseOptionalText(value, 'notes', NOTES_MAX);
}

function parseOptionalMemberNumber(value: unknown): string | null {
  return parseOptionalText(value, 'member_number', MEMBER_NUMBER_MAX);
}

function parseOptionalHolderName(value: unknown): string | null {
  return parseOptionalText(value, 'holder_name', HOLDER_NAME_MAX);
}

function parseOptionalReferencePrice(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw invalid('reference_price_cents deve ser um inteiro.');
  }
  if (value < 0 || value > REFERENCE_PRICE_MAX) {
    throw invalid(
      `reference_price_cents deve estar entre 0 e ${REFERENCE_PRICE_MAX}.`,
    );
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

// YYYY-MM-DD only — `valid_until` is a date, not a datetime.
function parseOptionalDateOnly(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw invalid(`${field} inválido.`);
  const datePart = value.length >= 10 ? value.slice(0, 10) : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    throw invalid(`${field} deve estar no formato YYYY-MM-DD.`);
  }
  const d = new Date(`${datePart}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw invalid(`${field} inválido.`);
  return datePart;
}

// ----- PII masking -----------------------------------------------------------

// Mask member_number for list views. Shows last 4 chars; the rest is "*".
// Returns the same shape (digits + asterisks) regardless of total length.
function maskMemberNumber(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= 4) return '*'.repeat(trimmed.length);
  const tail = trimmed.slice(-4);
  return `${'*'.repeat(Math.max(4, trimmed.length - 4))}${tail}`;
}

// ----- Same-clinic validators ------------------------------------------------

async function loadProvider(
  provider_id: string,
  clinica_id: string,
): Promise<InsuranceProviderRow> {
  const row = await insuranceProviderDao.findByIdForClinic(provider_id, clinica_id);
  if (!row) throw providerNotFound();
  return row;
}

async function loadActiveProvider(
  provider_id: string,
  clinica_id: string,
): Promise<InsuranceProviderRow> {
  const row = await loadProvider(provider_id, clinica_id);
  if (!row.active) {
    throw invalid('Operadora inativa. Reative-a antes de usá-la.');
  }
  return row;
}

async function loadPlanForProvider(
  plan_id: string,
  provider_id: string,
  clinica_id: string,
): Promise<InsurancePlanRow> {
  const plan = await insurancePlanDao.findByIdForClinic(plan_id, clinica_id);
  if (!plan) throw planNotFound();
  if (plan.provider_id !== provider_id) {
    throw invalid('O plano informado não pertence a esta operadora.');
  }
  return plan;
}

async function loadActivePatient(
  patient_id: string,
  clinica_id: string,
): Promise<void> {
  const patient = await patientDao.findByIdForClinic(patient_id, clinica_id);
  if (!patient || patient.status !== 'active' || patient.merged_into_id !== null) {
    throw patientNotFound();
  }
}

async function loadActiveService(
  service_id: string,
  clinica_id: string,
): Promise<void> {
  const svc = await clinicServiceDao.findByIdForClinic(service_id, clinica_id);
  if (!svc) throw serviceNotFound();
  if (!svc.active) {
    throw invalid('Serviço inativo. Reative-o antes de cadastrar preço de convênio.');
  }
}

// ----- Audit -----------------------------------------------------------------

// Audit is METADATA-ONLY (ADR 0016 §5.2). NEVER includes:
//   - patient name / CPF / contact data
//   - member_number / holder_name (PII)
//   - reference_price_cents / amount values
//   - any clinical data
// `recurso_id` is the entity id; `acao` follows the dot-notation pattern of
// existing audits.
async function safeAudit(
  acao: string,
  recurso: string,
  recurso_id: string | null,
  actor: InsuranceActor,
  ctx: AuthContext,
): Promise<void> {
  try {
    await auditLogDao.create({
      acao,
      usuario_id: actor.usuario_id,
      clinica_id: actor.clinica_id,
      recurso,
      recurso_id,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
    });
  } catch (err) {
    logger.error({ err, acao, audit_write_failed: true }, 'audit log write failed');
  }
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

// ============================================================================
// Public projections
// ============================================================================

export interface PublicInsuranceProvider {
  id: string;
  clinica_id: string;
  name: string;
  notes: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

function toPublicProvider(row: InsuranceProviderRow): PublicInsuranceProvider {
  return {
    id: row.id,
    clinica_id: row.clinica_id,
    name: row.name,
    notes: row.notes,
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface PublicInsurancePlan {
  id: string;
  clinica_id: string;
  provider_id: string;
  name: string;
  notes: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

function toPublicPlan(row: InsurancePlanRow): PublicInsurancePlan {
  return {
    id: row.id,
    clinica_id: row.clinica_id,
    provider_id: row.provider_id,
    name: row.name,
    notes: row.notes,
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Two projections for patient_insurances:
//   - List item: member_number MASKED + no notes (LGPD minimization).
//   - Detail: member_number RAW + holder_name RAW + notes (explicit drill-in).
export interface PublicPatientInsuranceListItem {
  id: string;
  clinica_id: string;
  patient_id: string;
  provider_id: string | null;
  plan_id: string | null;
  member_number_masked: string | null;
  holder_name: string | null;
  valid_until: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PublicPatientInsurance extends PublicPatientInsuranceListItem {
  member_number: string | null;
  notes: string | null;
}

function toPatientInsuranceListItem(
  row: PatientInsuranceRow,
): PublicPatientInsuranceListItem {
  return {
    id: row.id,
    clinica_id: row.clinica_id,
    patient_id: row.patient_id,
    provider_id: row.provider_id,
    plan_id: row.plan_id,
    member_number_masked: maskMemberNumber(row.member_number),
    holder_name: row.holder_name,
    valid_until: row.valid_until,
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toPublicPatientInsurance(row: PatientInsuranceRow): PublicPatientInsurance {
  return {
    ...toPatientInsuranceListItem(row),
    member_number: row.member_number,
    notes: row.notes,
  };
}

export interface PublicServiceInsurancePrice {
  id: string;
  clinica_id: string;
  service_id: string;
  provider_id: string;
  plan_id: string | null;
  reference_price_cents: number | null;
  notes: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

function toPublicServicePrice(
  row: ServiceInsurancePriceRow,
): PublicServiceInsurancePrice {
  return {
    id: row.id,
    clinica_id: row.clinica_id,
    service_id: row.service_id,
    provider_id: row.provider_id,
    plan_id: row.plan_id,
    reference_price_cents: row.reference_price_cents,
    notes: row.notes,
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ============================================================================
// insuranceProviderService
// ============================================================================

export const insuranceProviderService = {
  async list(
    actor: InsuranceActor,
    rawQuery: { active?: unknown; limit?: unknown; offset?: unknown },
  ): Promise<{ providers: PublicInsuranceProvider[] }> {
    assertNotProfissional(actor);
    const active = parseActiveFilter(rawQuery.active);
    const limit = parseLimit(rawQuery.limit);
    const offset = parseOffset(rawQuery.offset);
    const rows = await insuranceProviderDao.listForClinic(actor.clinica_id, {
      active,
      limit,
      offset,
    });
    return { providers: rows.map(toPublicProvider) };
  },

  async findById(
    actor: InsuranceActor,
    id_param: string,
  ): Promise<{ provider: PublicInsuranceProvider }> {
    assertNotProfissional(actor);
    const id = parseUuid(id_param, 'id');
    const row = await insuranceProviderDao.findByIdForClinic(id, actor.clinica_id);
    if (!row) throw providerNotFound();
    return { provider: toPublicProvider(row) };
  },

  async create(
    actor: InsuranceActor,
    body: { name?: unknown; notes?: unknown },
    ctx: AuthContext,
  ): Promise<{ provider: PublicInsuranceProvider }> {
    assertNotProfissional(actor);
    const name = parseName(body.name, 'name', PROVIDER_NAME_MAX);
    const notes = parseOptionalNotes(body.notes);

    const existing = await insuranceProviderDao.findByNameForClinic(
      actor.clinica_id,
      name,
    );
    if (existing) throw duplicateProviderName();

    let row: InsuranceProviderRow;
    try {
      row = await insuranceProviderDao.create({
        clinica_id: actor.clinica_id,
        name,
        notes,
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateProviderName();
      throw err;
    }

    await safeAudit(
      'insurance.provider.create.success',
      'insurance_provider',
      row.id,
      actor,
      ctx,
    );
    return { provider: toPublicProvider(row) };
  },

  async update(
    actor: InsuranceActor,
    id_param: string,
    body: { name?: unknown; notes?: unknown },
    ctx: AuthContext,
  ): Promise<{ provider: PublicInsuranceProvider }> {
    assertNotProfissional(actor);
    const id = parseUuid(id_param, 'id');
    const existing = await insuranceProviderDao.findByIdForClinic(id, actor.clinica_id);
    if (!existing) throw providerNotFound();

    const patch: { name?: string; notes?: string | null } = {};
    if (body.name !== undefined) patch.name = parseName(body.name, 'name', PROVIDER_NAME_MAX);
    if (body.notes !== undefined) patch.notes = parseOptionalNotes(body.notes);
    if (Object.keys(patch).length === 0) {
      throw invalid('Nenhum campo para atualizar.');
    }

    if (patch.name !== undefined && patch.name !== existing.name) {
      const dup = await insuranceProviderDao.findByNameForClinic(
        actor.clinica_id,
        patch.name,
      );
      if (dup && dup.id !== id) throw duplicateProviderName();
    }

    let updated: InsuranceProviderRow | undefined;
    try {
      updated = await insuranceProviderDao.updateForClinic(id, actor.clinica_id, patch);
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateProviderName();
      throw err;
    }
    if (!updated) throw providerNotFound();

    await safeAudit(
      'insurance.provider.update.success',
      'insurance_provider',
      updated.id,
      actor,
      ctx,
    );
    return { provider: toPublicProvider(updated) };
  },

  async updateStatus(
    actor: InsuranceActor,
    id_param: string,
    body: { active?: unknown },
    ctx: AuthContext,
  ): Promise<{ provider: PublicInsuranceProvider }> {
    assertNotProfissional(actor);
    const id = parseUuid(id_param, 'id');
    const active = parseActiveBody(body.active);

    const row = await insuranceProviderDao.updateStatus(id, actor.clinica_id, active);
    if (!row) throw providerNotFound();

    await safeAudit(
      'insurance.provider.status.update.success',
      'insurance_provider',
      row.id,
      actor,
      ctx,
    );
    return { provider: toPublicProvider(row) };
  },
};

// ============================================================================
// insurancePlanService
// ============================================================================

export const insurancePlanService = {
  async list(
    actor: InsuranceActor,
    rawQuery: {
      provider_id?: unknown;
      active?: unknown;
      limit?: unknown;
      offset?: unknown;
    },
  ): Promise<{ plans: PublicInsurancePlan[] }> {
    assertNotProfissional(actor);
    const provider_id = parseOptionalUuid(rawQuery.provider_id, 'provider_id');
    const active = parseActiveFilter(rawQuery.active);
    const limit = parseLimit(rawQuery.limit);
    const offset = parseOffset(rawQuery.offset);

    // If provider_id is given, verify same-clinic before listing — avoids
    // leaking "no plans for this provider" as cross-tenant probe response.
    if (provider_id) {
      await loadProvider(provider_id, actor.clinica_id);
    }

    const rows = await insurancePlanDao.listForClinic(actor.clinica_id, {
      provider_id,
      active,
      limit,
      offset,
    });
    return { plans: rows.map(toPublicPlan) };
  },

  async findById(
    actor: InsuranceActor,
    id_param: string,
  ): Promise<{ plan: PublicInsurancePlan }> {
    assertNotProfissional(actor);
    const id = parseUuid(id_param, 'id');
    const row = await insurancePlanDao.findByIdForClinic(id, actor.clinica_id);
    if (!row) throw planNotFound();
    return { plan: toPublicPlan(row) };
  },

  async create(
    actor: InsuranceActor,
    body: { provider_id?: unknown; name?: unknown; notes?: unknown },
    ctx: AuthContext,
  ): Promise<{ plan: PublicInsurancePlan }> {
    assertNotProfissional(actor);
    const provider_id = parseUuid(body.provider_id, 'provider_id');
    const name = parseName(body.name, 'name', PLAN_NAME_MAX);
    const notes = parseOptionalNotes(body.notes);

    await loadActiveProvider(provider_id, actor.clinica_id);

    const dup = await insurancePlanDao.findByNameForProvider(
      actor.clinica_id,
      provider_id,
      name,
    );
    if (dup) throw duplicatePlanName();

    let row: InsurancePlanRow;
    try {
      row = await insurancePlanDao.create({
        clinica_id: actor.clinica_id,
        provider_id,
        name,
        notes,
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicatePlanName();
      throw err;
    }

    await safeAudit(
      'insurance.plan.create.success',
      'insurance_plan',
      row.id,
      actor,
      ctx,
    );
    return { plan: toPublicPlan(row) };
  },

  async update(
    actor: InsuranceActor,
    id_param: string,
    body: { name?: unknown; notes?: unknown },
    ctx: AuthContext,
  ): Promise<{ plan: PublicInsurancePlan }> {
    assertNotProfissional(actor);
    const id = parseUuid(id_param, 'id');
    const existing = await insurancePlanDao.findByIdForClinic(id, actor.clinica_id);
    if (!existing) throw planNotFound();

    const patch: { name?: string; notes?: string | null } = {};
    if (body.name !== undefined) patch.name = parseName(body.name, 'name', PLAN_NAME_MAX);
    if (body.notes !== undefined) patch.notes = parseOptionalNotes(body.notes);
    if (Object.keys(patch).length === 0) {
      throw invalid('Nenhum campo para atualizar.');
    }

    if (patch.name !== undefined && patch.name !== existing.name) {
      const dup = await insurancePlanDao.findByNameForProvider(
        actor.clinica_id,
        existing.provider_id,
        patch.name,
      );
      if (dup && dup.id !== id) throw duplicatePlanName();
    }

    let updated: InsurancePlanRow | undefined;
    try {
      updated = await insurancePlanDao.updateForClinic(id, actor.clinica_id, patch);
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicatePlanName();
      throw err;
    }
    if (!updated) throw planNotFound();

    await safeAudit(
      'insurance.plan.update.success',
      'insurance_plan',
      updated.id,
      actor,
      ctx,
    );
    return { plan: toPublicPlan(updated) };
  },

  async updateStatus(
    actor: InsuranceActor,
    id_param: string,
    body: { active?: unknown },
    ctx: AuthContext,
  ): Promise<{ plan: PublicInsurancePlan }> {
    assertNotProfissional(actor);
    const id = parseUuid(id_param, 'id');
    const active = parseActiveBody(body.active);

    const row = await insurancePlanDao.updateStatus(id, actor.clinica_id, active);
    if (!row) throw planNotFound();

    await safeAudit(
      'insurance.plan.status.update.success',
      'insurance_plan',
      row.id,
      actor,
      ctx,
    );
    return { plan: toPublicPlan(row) };
  },
};

// ============================================================================
// patientInsuranceService
// ============================================================================

export const patientInsuranceService = {
  async list(
    actor: InsuranceActor,
    patient_id_param: string,
    rawQuery: { active?: unknown; limit?: unknown; offset?: unknown },
  ): Promise<{ insurances: PublicPatientInsuranceListItem[] }> {
    assertNotProfissional(actor);
    const patient_id = parseUuid(patient_id_param, 'patient_id');
    const active = parseActiveFilter(rawQuery.active);
    const limit = parseLimit(rawQuery.limit);
    const offset = parseOffset(rawQuery.offset);

    await loadActivePatient(patient_id, actor.clinica_id);

    const rows = await patientInsuranceDao.listForPatient(
      actor.clinica_id,
      patient_id,
      { active, limit, offset },
    );
    return { insurances: rows.map(toPatientInsuranceListItem) };
  },

  async findById(
    actor: InsuranceActor,
    patient_id_param: string,
    id_param: string,
  ): Promise<{ insurance: PublicPatientInsurance }> {
    assertNotProfissional(actor);
    const patient_id = parseUuid(patient_id_param, 'patient_id');
    const id = parseUuid(id_param, 'id');

    await loadActivePatient(patient_id, actor.clinica_id);

    const row = await patientInsuranceDao.findByIdForClinic(id, actor.clinica_id);
    if (!row || row.patient_id !== patient_id) throw patientInsuranceNotFound();

    return { insurance: toPublicPatientInsurance(row) };
  },

  async create(
    actor: InsuranceActor,
    patient_id_param: string,
    body: {
      provider_id?: unknown;
      plan_id?: unknown;
      member_number?: unknown;
      holder_name?: unknown;
      valid_until?: unknown;
      notes?: unknown;
    },
    ctx: AuthContext,
  ): Promise<{ insurance: PublicPatientInsurance }> {
    assertNotProfissional(actor);
    const patient_id = parseUuid(patient_id_param, 'patient_id');
    const provider_id = parseUuid(body.provider_id, 'provider_id');
    const plan_id = parseOptionalUuid(body.plan_id, 'plan_id');
    const member_number = parseOptionalMemberNumber(body.member_number);
    const holder_name = parseOptionalHolderName(body.holder_name);
    const valid_until = parseOptionalDateOnly(body.valid_until, 'valid_until');
    const notes = parseOptionalNotes(body.notes);

    await loadActivePatient(patient_id, actor.clinica_id);
    await loadActiveProvider(provider_id, actor.clinica_id);
    if (plan_id) {
      await loadPlanForProvider(plan_id, provider_id, actor.clinica_id);
    }

    const row = await patientInsuranceDao.create({
      clinica_id: actor.clinica_id,
      patient_id,
      provider_id,
      plan_id,
      member_number,
      holder_name,
      valid_until,
      notes,
    });

    await safeAudit(
      'insurance.patient.link.success',
      'patient_insurance',
      row.id,
      actor,
      ctx,
    );
    return { insurance: toPublicPatientInsurance(row) };
  },

  async update(
    actor: InsuranceActor,
    patient_id_param: string,
    id_param: string,
    body: {
      provider_id?: unknown;
      plan_id?: unknown;
      member_number?: unknown;
      holder_name?: unknown;
      valid_until?: unknown;
      notes?: unknown;
    },
    ctx: AuthContext,
  ): Promise<{ insurance: PublicPatientInsurance }> {
    assertNotProfissional(actor);
    const patient_id = parseUuid(patient_id_param, 'patient_id');
    const id = parseUuid(id_param, 'id');

    await loadActivePatient(patient_id, actor.clinica_id);

    const existing = await patientInsuranceDao.findByIdForClinic(id, actor.clinica_id);
    if (!existing || existing.patient_id !== patient_id) {
      throw patientInsuranceNotFound();
    }

    const patch: {
      provider_id?: string;
      plan_id?: string | null;
      member_number?: string | null;
      holder_name?: string | null;
      valid_until?: string | null;
      notes?: string | null;
    } = {};

    if (body.provider_id !== undefined) {
      patch.provider_id = parseUuid(body.provider_id, 'provider_id');
      await loadActiveProvider(patch.provider_id, actor.clinica_id);
    }
    if (body.plan_id !== undefined) {
      patch.plan_id = parseOptionalUuid(body.plan_id, 'plan_id');
    }
    if (body.member_number !== undefined) {
      patch.member_number = parseOptionalMemberNumber(body.member_number);
    }
    if (body.holder_name !== undefined) {
      patch.holder_name = parseOptionalHolderName(body.holder_name);
    }
    if (body.valid_until !== undefined) {
      patch.valid_until = parseOptionalDateOnly(body.valid_until, 'valid_until');
    }
    if (body.notes !== undefined) {
      patch.notes = parseOptionalNotes(body.notes);
    }

    if (Object.keys(patch).length === 0) {
      throw invalid('Nenhum campo para atualizar.');
    }

    // Validate plan binding to provider with the effective values (post-patch).
    const effectiveProvider = patch.provider_id ?? existing.provider_id;
    const effectivePlan =
      patch.plan_id !== undefined ? patch.plan_id : existing.plan_id;
    if (effectivePlan) {
      if (!effectiveProvider) {
        throw invalid('Defina a operadora antes de associar um plano.');
      }
      await loadPlanForProvider(effectivePlan, effectiveProvider, actor.clinica_id);
    }

    const updated = await patientInsuranceDao.updateForClinic(
      id,
      actor.clinica_id,
      patch,
    );
    if (!updated) throw patientInsuranceNotFound();

    await safeAudit(
      'insurance.patient.update.success',
      'patient_insurance',
      updated.id,
      actor,
      ctx,
    );
    return { insurance: toPublicPatientInsurance(updated) };
  },

  async updateStatus(
    actor: InsuranceActor,
    patient_id_param: string,
    id_param: string,
    body: { active?: unknown },
    ctx: AuthContext,
  ): Promise<{ insurance: PublicPatientInsurance }> {
    assertNotProfissional(actor);
    const patient_id = parseUuid(patient_id_param, 'patient_id');
    const id = parseUuid(id_param, 'id');
    const active = parseActiveBody(body.active);

    await loadActivePatient(patient_id, actor.clinica_id);

    const existing = await patientInsuranceDao.findByIdForClinic(id, actor.clinica_id);
    if (!existing || existing.patient_id !== patient_id) {
      throw patientInsuranceNotFound();
    }

    const updated = await patientInsuranceDao.updateStatus(
      id,
      actor.clinica_id,
      active,
    );
    if (!updated) throw patientInsuranceNotFound();

    await safeAudit(
      'insurance.patient.status.update.success',
      'patient_insurance',
      updated.id,
      actor,
      ctx,
    );
    return { insurance: toPublicPatientInsurance(updated) };
  },
};

// ============================================================================
// serviceInsurancePriceService
// ============================================================================

export const serviceInsurancePriceService = {
  async list(
    actor: InsuranceActor,
    rawQuery: {
      service_id?: unknown;
      provider_id?: unknown;
      plan_id?: unknown;
      active?: unknown;
      limit?: unknown;
      offset?: unknown;
    },
  ): Promise<{ prices: PublicServiceInsurancePrice[] }> {
    assertNotProfissional(actor);
    const service_id = parseOptionalUuid(rawQuery.service_id, 'service_id');
    const provider_id = parseOptionalUuid(rawQuery.provider_id, 'provider_id');
    const plan_id = parseOptionalUuid(rawQuery.plan_id, 'plan_id');
    const active = parseActiveFilter(rawQuery.active);
    const limit = parseLimit(rawQuery.limit);
    const offset = parseOffset(rawQuery.offset);

    // Verify same-clinic on any filter id provided (anti-enumeration).
    if (provider_id) await loadProvider(provider_id, actor.clinica_id);
    if (service_id) {
      const svc = await clinicServiceDao.findByIdForClinic(service_id, actor.clinica_id);
      if (!svc) throw serviceNotFound();
    }

    const rows = await serviceInsurancePriceDao.listForClinic(actor.clinica_id, {
      service_id,
      provider_id,
      plan_id,
      active,
      limit,
      offset,
    });
    return { prices: rows.map(toPublicServicePrice) };
  },

  async findById(
    actor: InsuranceActor,
    id_param: string,
  ): Promise<{ price: PublicServiceInsurancePrice }> {
    assertNotProfissional(actor);
    const id = parseUuid(id_param, 'id');
    const row = await serviceInsurancePriceDao.findByIdForClinic(id, actor.clinica_id);
    if (!row) throw servicePriceNotFound();
    return { price: toPublicServicePrice(row) };
  },

  async create(
    actor: InsuranceActor,
    body: {
      service_id?: unknown;
      provider_id?: unknown;
      plan_id?: unknown;
      reference_price_cents?: unknown;
      notes?: unknown;
    },
    ctx: AuthContext,
  ): Promise<{ price: PublicServiceInsurancePrice }> {
    assertNotProfissional(actor);
    const service_id = parseUuid(body.service_id, 'service_id');
    const provider_id = parseUuid(body.provider_id, 'provider_id');
    const plan_id = parseOptionalUuid(body.plan_id, 'plan_id');
    const reference_price_cents = parseOptionalReferencePrice(body.reference_price_cents);
    const notes = parseOptionalNotes(body.notes);

    await loadActiveService(service_id, actor.clinica_id);
    await loadActiveProvider(provider_id, actor.clinica_id);
    if (plan_id) {
      await loadPlanForProvider(plan_id, provider_id, actor.clinica_id);
    }

    const dup = await serviceInsurancePriceDao.findByTupleForClinic(
      actor.clinica_id,
      service_id,
      provider_id,
      plan_id,
    );
    if (dup) throw duplicateServicePrice();

    let row: ServiceInsurancePriceRow;
    try {
      row = await serviceInsurancePriceDao.create({
        clinica_id: actor.clinica_id,
        service_id,
        provider_id,
        plan_id,
        reference_price_cents,
        notes,
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateServicePrice();
      throw err;
    }

    await safeAudit(
      'insurance.service_price.create.success',
      'insurance_service_price',
      row.id,
      actor,
      ctx,
    );
    return { price: toPublicServicePrice(row) };
  },

  async update(
    actor: InsuranceActor,
    id_param: string,
    body: { reference_price_cents?: unknown; notes?: unknown },
    ctx: AuthContext,
  ): Promise<{ price: PublicServiceInsurancePrice }> {
    assertNotProfissional(actor);
    const id = parseUuid(id_param, 'id');
    const existing = await serviceInsurancePriceDao.findByIdForClinic(
      id,
      actor.clinica_id,
    );
    if (!existing) throw servicePriceNotFound();

    const patch: { reference_price_cents?: number | null; notes?: string | null } = {};
    if (body.reference_price_cents !== undefined) {
      patch.reference_price_cents = parseOptionalReferencePrice(body.reference_price_cents);
    }
    if (body.notes !== undefined) patch.notes = parseOptionalNotes(body.notes);
    if (Object.keys(patch).length === 0) {
      throw invalid('Nenhum campo para atualizar.');
    }

    const updated = await serviceInsurancePriceDao.updateForClinic(
      id,
      actor.clinica_id,
      patch,
    );
    if (!updated) throw servicePriceNotFound();

    await safeAudit(
      'insurance.service_price.update.success',
      'insurance_service_price',
      updated.id,
      actor,
      ctx,
    );
    return { price: toPublicServicePrice(updated) };
  },

  async updateStatus(
    actor: InsuranceActor,
    id_param: string,
    body: { active?: unknown },
    ctx: AuthContext,
  ): Promise<{ price: PublicServiceInsurancePrice }> {
    assertNotProfissional(actor);
    const id = parseUuid(id_param, 'id');
    const active = parseActiveBody(body.active);

    const row = await serviceInsurancePriceDao.updateStatus(
      id,
      actor.clinica_id,
      active,
    );
    if (!row) throw servicePriceNotFound();

    await safeAudit(
      'insurance.service_price.status.update.success',
      'insurance_service_price',
      row.id,
      actor,
      ctx,
    );
    return { price: toPublicServicePrice(row) };
  },
};

// ============================================================================
// financialInsuranceValidation — used by financialChargeService
// ============================================================================
//
// Helpers exported for `financialChargeService` to validate payer_type +
// insurance fields without auto-propagating any reference price.
//
// Rules:
//   - payer_type='private': insurance_provider_id and patient_insurance_id
//     MUST be NULL; copay/insurance amounts MUST be NULL.
//   - payer_type='insurance' or 'mixed':
//       * patient_insurance_id is REQUIRED and must belong to same clinic +
//         same patient.
//       * insurance_provider_id is OPTIONAL on input but DERIVED from the
//         patient_insurance if absent; if explicitly set, it must match the
//         provider of the patient_insurance.
//       * copay_amount_cents / insurance_amount_cents are optional integers
//         within [0, AMOUNT_MAX]. The financial service validates the sum
//         against amount_cents when both are present (mixed only).

export interface ParsedInsuranceFields {
  payer_type: PayerType | null;
  insurance_provider_id: string | null;
  patient_insurance_id: string | null;
  copay_amount_cents: number | null;
  insurance_amount_cents: number | null;
}

function parsePayerType(value: unknown): PayerType | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !(PAYER_TYPES as readonly string[]).includes(value)) {
    throw invalid('payer_type inválido. Use private, insurance ou mixed.');
  }
  return value as PayerType;
}

function parseOptionalNonNegativeInt(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw invalid(`${field} deve ser um inteiro.`);
  }
  if (value < 0 || value > REFERENCE_PRICE_MAX) {
    throw invalid(`${field} deve estar entre 0 e ${REFERENCE_PRICE_MAX}.`);
  }
  return value;
}

// Pure parsing — does NOT touch the DB. Returns the candidate fields or
// throws on syntactic errors. Tenant validation runs in `validateForCharge`.
export function parseInsuranceFieldsForCharge(body: {
  payer_type?: unknown;
  insurance_provider_id?: unknown;
  patient_insurance_id?: unknown;
  copay_amount_cents?: unknown;
  insurance_amount_cents?: unknown;
}): ParsedInsuranceFields {
  return {
    payer_type: parsePayerType(body.payer_type),
    insurance_provider_id: parseOptionalUuid(body.insurance_provider_id, 'insurance_provider_id'),
    patient_insurance_id: parseOptionalUuid(body.patient_insurance_id, 'patient_insurance_id'),
    copay_amount_cents: parseOptionalNonNegativeInt(body.copay_amount_cents, 'copay_amount_cents'),
    insurance_amount_cents: parseOptionalNonNegativeInt(
      body.insurance_amount_cents,
      'insurance_amount_cents',
    ),
  };
}

// Validates the parsed insurance fields against the persistent state:
//   - patient + tenant binding,
//   - provider + tenant binding,
//   - patient_insurance matches the patient,
//   - private rejects insurance_* fields.
//
// Returns the validated values (provider_id is derived from patient_insurance
// when not given explicitly).
export async function validateInsuranceForCharge(
  parsed: ParsedInsuranceFields,
  clinica_id: string,
  patient_id: string,
  amount_cents: number,
): Promise<ParsedInsuranceFields> {
  const {
    payer_type,
    insurance_provider_id,
    patient_insurance_id,
    copay_amount_cents,
    insurance_amount_cents,
  } = parsed;

  // payer_type omitted → no insurance involved; reject any partial insurance
  // payload (defensive: don't silently store fragmentary insurance metadata).
  if (payer_type === null) {
    if (
      insurance_provider_id !== null ||
      patient_insurance_id !== null ||
      copay_amount_cents !== null ||
      insurance_amount_cents !== null
    ) {
      throw invalid(
        'payer_type é obrigatório quando qualquer campo de convênio é informado.',
      );
    }
    return parsed;
  }

  // private: insurance_* fields MUST be all NULL.
  if (payer_type === 'private') {
    if (
      insurance_provider_id !== null ||
      patient_insurance_id !== null ||
      copay_amount_cents !== null ||
      insurance_amount_cents !== null
    ) {
      throw invalid(
        'Cobrança particular não pode ter operadora, carteirinha ou valores de convênio.',
      );
    }
    return parsed;
  }

  // insurance | mixed: patient_insurance_id REQUIRED.
  if (!patient_insurance_id) {
    throw invalid('patient_insurance_id é obrigatório para cobranças de convênio.');
  }

  const pi = await patientInsuranceDao.findByIdForClinic(
    patient_insurance_id,
    clinica_id,
  );
  if (!pi) throw patientInsuranceNotFound();
  if (pi.patient_id !== patient_id) {
    throw invalid('Carteirinha não pertence ao paciente da cobrança.');
  }
  if (!pi.active) {
    throw invalid('Carteirinha inativa. Reative-a antes de vincular à cobrança.');
  }
  if (!pi.provider_id) {
    throw invalid('Carteirinha sem operadora vinculada.');
  }

  // Reconcile provider_id: derive from carteirinha when omitted; require match
  // when explicitly given.
  let effectiveProviderId = insurance_provider_id;
  if (effectiveProviderId === null) {
    effectiveProviderId = pi.provider_id;
  } else if (effectiveProviderId !== pi.provider_id) {
    throw invalid('insurance_provider_id não coincide com a operadora da carteirinha.');
  }

  // Confirm provider is in same clinic (defensive — the carteirinha already
  // implies this, but the FK is SET NULL and we don't want stale references).
  const provider = await insuranceProviderDao.findByIdForClinic(
    effectiveProviderId,
    clinica_id,
  );
  if (!provider) throw providerNotFound();

  // mixed: when both partial amounts are present, they must sum to amount_cents.
  // We do NOT auto-derive one from the other — humano decide. Single-side
  // values are allowed (e.g. only insurance_amount_cents) without enforcement.
  if (payer_type === 'mixed') {
    if (copay_amount_cents !== null && insurance_amount_cents !== null) {
      if (copay_amount_cents + insurance_amount_cents !== amount_cents) {
        throw invalid(
          'A soma de copay_amount_cents e insurance_amount_cents deve ser igual a amount_cents.',
        );
      }
    }
  }

  return {
    payer_type,
    insurance_provider_id: effectiveProviderId,
    patient_insurance_id,
    copay_amount_cents,
    insurance_amount_cents,
  };
}
