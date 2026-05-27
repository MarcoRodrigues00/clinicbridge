import { logger } from '../config/logger';
import { appointmentDao } from '../dao/appointmentDao';
import { auditLogDao } from '../dao/auditLogDao';
import { clinicServiceDao, professionalServiceDao } from '../dao/clinicServiceDao';
import { financialChargeDao } from '../dao/financialChargeDao';
import type { FinancialSummary } from '../dao/financialChargeDao';
import { patientDao } from '../dao/patientDao';
import { userClinicalRoleDao } from '../dao/userClinicalRoleDao';
import { HttpError } from '../middlewares/errorHandler';
import type {
  FinancialChargeRow,
  FinancialChargeStatus,
  FinancialPaymentMethod,
  UserClinicalRoleName,
  UserPapel,
} from '../types/db';
import type { AuthContext } from './authService';

// Financial Module v0.1 service (Sprint 4.4B; ADR 0012).
//
// ARCHITECTURAL NOTE — financial × clinical separation (ADR 0012 §7.1):
// The module is administrative. Routes use `requireRole(['dono_clinica',
// 'secretaria'])` for the broad admin gate; the fine-grained role policy
// (gestor downgrade, profissional block) lives HERE in the service.
//
// Access matrix (ADR 0012 §7.3, reconciled with smoke users — testing-checklist
// shows gestor/profissional both have `papel='secretaria'` plus a clinical
// role grant):
//
//   papel=dono_clinica                                  → 'full'
//   papel=secretaria + no clinical grants               → 'full'
//   papel=secretaria + grant profissional_clinico       → 'none' (hard block)
//   papel=secretaria + grant gestor_clinica             → 'transact' (no create/update)
//   papel=secretaria + both grants                      → 'none' (profissional grant wins)
//   papel=admin_sistema                                 → blocked upstream by requireClinic
//
// `none` → 403 on every endpoint (profissional_clinico has no financial access).
// `transact` → 403 only on create/update; allows list/detail/mark-paid/cancel/summary.

export interface FinancialActorInput {
  clinica_id: string;
  usuario_id: string;
  papel: UserPapel;
}

export interface FinancialActor extends FinancialActorInput {
  clinical_grants: Set<UserClinicalRoleName>;
}

export type FinancialAccess = 'full' | 'transact' | 'none';

// Load clinical role grants once per request. Same one-indexed-SELECT pattern
// used by requireClinicalRole.
export async function buildFinancialActor(
  input: FinancialActorInput,
): Promise<FinancialActor> {
  const grants = await userClinicalRoleDao.listActiveRoleNames(
    input.usuario_id,
    input.clinica_id,
  );
  return {
    ...input,
    clinical_grants: new Set(grants),
  };
}

export function effectiveFinancialAccess(actor: FinancialActor): FinancialAccess {
  // Profissional clínico is always blocked (ADR 0012 §7.2).
  if (actor.clinical_grants.has('profissional_clinico')) return 'none';
  // Owner: full.
  if (actor.papel === 'dono_clinica') return 'full';
  // Gestor (secretaria-papel with gestor_clinica grant): transact only.
  if (actor.clinical_grants.has('gestor_clinica')) return 'transact';
  // Pure secretaria (no grants): full.
  if (actor.papel === 'secretaria') return 'full';
  // Any other papel (admin_sistema) cannot reach this code path because
  // requireClinic blocks it; defensive fallback to none.
  return 'none';
}

// ----- Validation constants -------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_VALUES: readonly FinancialChargeStatus[] = ['pending', 'paid', 'canceled'];
const PAYMENT_METHODS: readonly FinancialPaymentMethod[] = [
  'cash',
  'pix',
  'card',
  'bank_transfer',
  'other',
];

const DESCRIPTION_MAX = 500;
const NOTES_MAX = 500;
const CANCEL_REASON_MAX = 200;
const AMOUNT_MAX = 99_999_999; // R$ 999_999,99 — sanity cap, well within int4.

const LIST_DEFAULT_LIMIT = 50;
const LIST_MAX_LIMIT = 100;
const LIST_MAX_OFFSET = 10_000;

// ----- Error helpers --------------------------------------------------------

function invalid(message: string): HttpError {
  return new HttpError(400, 'financial_charge_invalid', message);
}

function notPending(): HttpError {
  return new HttpError(
    400,
    'charge_not_pending',
    'Esta cobrança não está em pendente — operação não permitida.',
  );
}

function chargeNotFound(): HttpError {
  return new HttpError(404, 'charge_not_found', 'Cobrança não encontrada.');
}

function patientNotFound(): HttpError {
  return new HttpError(404, 'patient_not_found', 'Paciente não encontrado.');
}

function forbidden(): HttpError {
  // Single, generic 403 for any access mismatch — matches requireRole shape.
  return new HttpError(
    403,
    'forbidden_role',
    'Você não tem permissão para esta operação financeira.',
  );
}

// ----- Parsers --------------------------------------------------------------

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

function parseDescription(value: unknown): string {
  if (typeof value !== 'string') {
    throw invalid('description é obrigatório.');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw invalid('description é obrigatório.');
  }
  if (trimmed.length > DESCRIPTION_MAX) {
    throw invalid(`description deve ter no máximo ${DESCRIPTION_MAX} caracteres.`);
  }
  return trimmed;
}

function parseAmountCents(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw invalid('amount_cents deve ser um inteiro.');
  }
  if (value <= 0) {
    throw invalid('amount_cents deve ser maior que zero.');
  }
  if (value > AMOUNT_MAX) {
    throw invalid('amount_cents excede o valor máximo permitido.');
  }
  return value;
}

// Accepts YYYY-MM-DD or full ISO. Stored as a date (no time).
function parseOptionalDueDate(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw invalid('due_date inválido.');
  }
  // Permissive: accept YYYY-MM-DD or ISO with time.
  const datePart = value.length >= 10 ? value.slice(0, 10) : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    throw invalid('due_date deve estar no formato YYYY-MM-DD.');
  }
  // Validate it's a real calendar date.
  const d = new Date(`${datePart}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw invalid('due_date inválida.');
  }
  return datePart;
}

function parseOptionalNotes(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw invalid('notes inválido.');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > NOTES_MAX) {
    throw invalid(`notes deve ter no máximo ${NOTES_MAX} caracteres.`);
  }
  return trimmed;
}

function parseOptionalCancelReason(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw invalid('cancel_reason inválido.');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > CANCEL_REASON_MAX) {
    throw invalid(`cancel_reason deve ter no máximo ${CANCEL_REASON_MAX} caracteres.`);
  }
  return trimmed;
}

function parsePaymentMethod(value: unknown): FinancialPaymentMethod {
  if (
    typeof value !== 'string' ||
    !(PAYMENT_METHODS as readonly string[]).includes(value)
  ) {
    throw invalid(
      `payment_method inválido. Use um de: ${PAYMENT_METHODS.join(', ')}.`,
    );
  }
  return value as FinancialPaymentMethod;
}

function parseStatusFilter(value: unknown): FinancialChargeStatus | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !(STATUS_VALUES as readonly string[]).includes(value)) {
    throw invalid('status inválido.');
  }
  return value as FinancialChargeStatus;
}

function parseOptionalIsoDate(value: unknown, field: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw invalid(`${field} inválido.`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw invalid(`${field} inválido.`);
  }
  return d;
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

// ----- Patient / appointment validation -------------------------------------

async function loadActivePatient(
  patient_id: string,
  clinica_id: string,
): Promise<{ patient_id: string }> {
  const patient = await patientDao.findByIdForClinic(patient_id, clinica_id);
  if (!patient || patient.status !== 'active' || patient.merged_into_id !== null) {
    throw patientNotFound();
  }
  return { patient_id: patient.id };
}

// Cross-validates appointment_id (ADR 0012 §16.2): same clinica + same patient.
// Returns the validated appointment_id or null. Throws 400 if invalid.
async function validateAppointmentLink(
  appointment_id: string | null,
  clinica_id: string,
  patient_id: string,
): Promise<string | null> {
  if (!appointment_id) return null;
  const appt = await appointmentDao.findByIdForClinic(appointment_id, clinica_id);
  if (!appt) {
    // Cross-tenant or non-existent — generic 400 (anti-enumeration via uniform code).
    throw invalid('appointment_id inválido.');
  }
  if (appt.patient_id !== patient_id) {
    throw invalid('appointment_id pertence a outro paciente.');
  }
  return appt.id;
}

// Validates service_id (ADR 0015): same clinic, active service.
// If both service_id and appointment_id are set and the appointment already
// has a service_id, they must match (prevents inconsistent service labeling).
// NEVER auto-propagates price_cents to amount_cents.
async function validateServiceLink(
  service_id: string | null,
  clinica_id: string,
  appointment_id: string | null,
): Promise<string | null> {
  if (!service_id) return null;
  const svc = await clinicServiceDao.findByIdForClinic(service_id, clinica_id);
  if (!svc) {
    throw invalid('service_id inválido para esta clínica.');
  }
  if (!svc.active) {
    throw invalid('Serviço inativo. Reative-o antes de usá-lo em uma cobrança.');
  }
  if (appointment_id) {
    const appt = await appointmentDao.findByIdForClinic(appointment_id, clinica_id);
    if (appt) {
      if (appt.service_id !== null && appt.service_id !== service_id) {
        throw new HttpError(
          400,
          'service_mismatch_with_appointment',
          'O serviço informado não coincide com o serviço do agendamento vinculado.',
        );
      }
      if (appt.professional_id) {
        const binding = await professionalServiceDao.findBinding(
          clinica_id,
          appt.professional_id,
          service_id,
        );
        if (!binding || !binding.active) {
          throw new HttpError(
            400,
            'service_not_available_for_appointment_professional',
            'Este serviço não está vinculado ao profissional do agendamento.',
          );
        }
      }
    }
  }
  return service_id;
}

// ----- Audit helpers --------------------------------------------------------

async function safeAudit(
  acao: string,
  recurso_id: string | null,
  actor: FinancialActor,
  ctx: AuthContext,
): Promise<void> {
  try {
    await auditLogDao.create({
      acao,
      usuario_id: actor.usuario_id,
      clinica_id: actor.clinica_id,
      recurso: 'financial_charge',
      recurso_id,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
    });
  } catch (err) {
    // Best-effort write-side audit (mirrors clinicalDocumentService.safeAudit).
    // Financial v0.1 has NO content-read audit (ADR 0012 §8.2) — only this
    // best-effort write audit. Failure logs an error but does NOT abort the
    // operation (the row already exists at this point).
    logger.error({ err, acao, audit_write_failed: true }, 'audit log write failed');
  }
}

// ----- Public projections ---------------------------------------------------

// Two projections, mirroring clinical_documents pattern (ADR 0012 §11):
//
//   PublicFinancialChargeListItem (METADATA — list shape)
//     - Returned by list and listForPatient.
//     - DROPS `notes` (administrative free-text — only the detail view surfaces it).
//     - Audit-wise: no audit (financial v0.1 has no content-read audit).
//
//   PublicFinancialCharge (DETAIL)
//     - Returned by create, findById, update, markPaid, cancel.
//     - Includes `notes`.
export interface PublicFinancialChargeListItem {
  id: string;
  clinica_id: string;
  patient_id: string;
  appointment_id: string | null;
  service_id: string | null;
  created_by_user_id: string;
  description: string;
  amount_cents: number;
  currency: 'BRL';
  due_date: string | null;
  status: FinancialChargeStatus;
  paid_at: Date | null;
  paid_by_user_id: string | null;
  payment_method: FinancialPaymentMethod | null;
  canceled_at: Date | null;
  canceled_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PublicFinancialCharge extends PublicFinancialChargeListItem {
  notes: string | null;
  cancel_reason: string | null;
}

function toListItem(row: FinancialChargeRow): PublicFinancialChargeListItem {
  return {
    id: row.id,
    clinica_id: row.clinica_id,
    patient_id: row.patient_id,
    appointment_id: row.appointment_id,
    service_id: row.service_id,
    created_by_user_id: row.created_by_user_id,
    description: row.description,
    amount_cents: row.amount_cents,
    currency: row.currency,
    due_date: row.due_date,
    status: row.status,
    paid_at: row.paid_at,
    paid_by_user_id: row.paid_by_user_id,
    payment_method: row.payment_method,
    canceled_at: row.canceled_at,
    canceled_by_user_id: row.canceled_by_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toPublicCharge(row: FinancialChargeRow): PublicFinancialCharge {
  return {
    ...toListItem(row),
    notes: row.notes,
    cancel_reason: row.cancel_reason,
  };
}

// ----- Service --------------------------------------------------------------

export const financialChargeService = {
  buildActor: buildFinancialActor,

  // POST /financial/charges — create pending charge. ADR 0012 §11.1.
  // Requires effective access 'full' (dono_clinica or pure secretaria).
  async create(
    actor: FinancialActor,
    body: {
      patient_id?: unknown;
      appointment_id?: unknown;
      service_id?: unknown;
      description?: unknown;
      amount_cents?: unknown;
      due_date?: unknown;
      notes?: unknown;
    },
    ctx: AuthContext,
  ): Promise<{ charge: PublicFinancialCharge }> {
    if (effectiveFinancialAccess(actor) !== 'full') {
      throw forbidden();
    }
    const patient_id = parseUuid(body.patient_id, 'patient_id');
    const description = parseDescription(body.description);
    const amount_cents = parseAmountCents(body.amount_cents);
    const due_date = parseOptionalDueDate(body.due_date);
    const notes = parseOptionalNotes(body.notes);
    const requestedAppointmentId = parseOptionalUuid(body.appointment_id, 'appointment_id');

    // Patient active + non-merged + same clinic. Generic 404.
    await loadActivePatient(patient_id, actor.clinica_id);

    // Optional appointment link (ADR 0012 §16.2).
    const appointment_id = await validateAppointmentLink(
      requestedAppointmentId,
      actor.clinica_id,
      patient_id,
    );

    // Optional service catalog reference (ADR 0015). NEVER auto-propagates
    // price_cents to amount_cents — human always decides the charge value.
    const service_id = await validateServiceLink(
      parseOptionalUuid(body.service_id, 'service_id'),
      actor.clinica_id,
      appointment_id,
    );

    const row = await financialChargeDao.create({
      clinica_id: actor.clinica_id,
      patient_id,
      appointment_id,
      service_id,
      created_by_user_id: actor.usuario_id,
      description,
      amount_cents,
      due_date,
      notes,
    });

    await safeAudit('financial.charge.created.success', row.id, actor, ctx);
    return { charge: toPublicCharge(row) };
  },

  // GET /financial/charges — list. ADR 0012 §11.2.
  // Requires effective access 'transact' or 'full'.
  async list(
    actor: FinancialActor,
    rawQuery: {
      patient_id?: unknown;
      appointment_id?: unknown;
      status?: unknown;
      date_from?: unknown;
      date_to?: unknown;
      limit?: unknown;
      offset?: unknown;
    },
  ): Promise<{ charges: PublicFinancialChargeListItem[] }> {
    const access = effectiveFinancialAccess(actor);
    if (access === 'none') throw forbidden();

    const patient_id = parseOptionalUuid(rawQuery.patient_id, 'patient_id');
    const appointment_id = parseOptionalUuid(rawQuery.appointment_id, 'appointment_id');
    const status = parseStatusFilter(rawQuery.status);
    const from = parseOptionalIsoDate(rawQuery.date_from, 'date_from');
    const to = parseOptionalIsoDate(rawQuery.date_to, 'date_to');
    if (from && to && to.getTime() <= from.getTime()) {
      throw invalid('date_to deve ser maior que date_from.');
    }
    const limit = parseLimit(rawQuery.limit);
    const offset = parseOffset(rawQuery.offset);

    const rows = await financialChargeDao.listForClinic(actor.clinica_id, {
      patient_id,
      appointment_id,
      status,
      from,
      to,
      limit,
      offset,
    });
    return { charges: rows.map(toListItem) };
  },

  // GET /financial/charges/:id — detail (includes notes).
  // Requires effective access 'transact' or 'full'.
  async findById(
    actor: FinancialActor,
    id: string,
  ): Promise<{ charge: PublicFinancialCharge }> {
    const access = effectiveFinancialAccess(actor);
    if (access === 'none') throw forbidden();

    const chargeId = parseUuid(id, 'id');
    const row = await financialChargeDao.findByIdForClinic(chargeId, actor.clinica_id);
    if (!row) throw chargeNotFound();
    return { charge: toPublicCharge(row) };
  },

  // PATCH /financial/charges/:id — update pending charge. ADR 0012 §11.4.
  // Requires effective access 'full' (gestor blocked from edits).
  async update(
    actor: FinancialActor,
    id: string,
    body: {
      description?: unknown;
      amount_cents?: unknown;
      due_date?: unknown;
      notes?: unknown;
      appointment_id?: unknown;
      service_id?: unknown;
    },
    ctx: AuthContext,
  ): Promise<{ charge: PublicFinancialCharge }> {
    if (effectiveFinancialAccess(actor) !== 'full') {
      throw forbidden();
    }
    const chargeId = parseUuid(id, 'id');

    // Read first to verify it exists and is pending, and to keep the same
    // patient_id when validating a new appointment_id.
    const existing = await financialChargeDao.findByIdForClinic(chargeId, actor.clinica_id);
    if (!existing) throw chargeNotFound();
    if (existing.status !== 'pending') throw notPending();

    const patch: {
      description?: string;
      amount_cents?: number;
      due_date?: string | null;
      notes?: string | null;
      appointment_id?: string | null;
      service_id?: string | null;
    } = {};

    if (body.description !== undefined) {
      patch.description = parseDescription(body.description);
    }
    if (body.amount_cents !== undefined) {
      patch.amount_cents = parseAmountCents(body.amount_cents);
    }
    if (body.due_date !== undefined) {
      patch.due_date = parseOptionalDueDate(body.due_date);
    }
    if (body.notes !== undefined) {
      patch.notes = parseOptionalNotes(body.notes);
    }
    if (body.appointment_id !== undefined) {
      if (body.appointment_id === null || body.appointment_id === '') {
        patch.appointment_id = null;
      } else {
        const newApptId = parseUuid(body.appointment_id, 'appointment_id');
        const validated = await validateAppointmentLink(
          newApptId,
          actor.clinica_id,
          existing.patient_id,
        );
        patch.appointment_id = validated;
      }
    }
    if (body.service_id !== undefined) {
      const targetApptId = patch.appointment_id !== undefined
        ? patch.appointment_id
        : existing.appointment_id;
      patch.service_id = await validateServiceLink(
        body.service_id === null || body.service_id === '' ? null : parseUuid(body.service_id, 'service_id'),
        actor.clinica_id,
        targetApptId,
      );
    }

    const updated = await financialChargeDao.updatePending(
      chargeId,
      actor.clinica_id,
      patch,
    );
    if (!updated) {
      // Race window between read and update — transitioned out of pending.
      throw notPending();
    }
    await safeAudit('financial.charge.updated.success', updated.id, actor, ctx);
    return { charge: toPublicCharge(updated) };
  },

  // POST /financial/charges/:id/mark-paid — pending → paid. ADR 0012 §11.5.
  // Requires effective access 'transact' or 'full'.
  async markPaid(
    actor: FinancialActor,
    id: string,
    body: { payment_method?: unknown; paid_at?: unknown },
    ctx: AuthContext,
  ): Promise<{ charge: PublicFinancialCharge }> {
    const access = effectiveFinancialAccess(actor);
    if (access === 'none') throw forbidden();

    const chargeId = parseUuid(id, 'id');
    if (body.payment_method === undefined || body.payment_method === null || body.payment_method === '') {
      throw new HttpError(
        400,
        'payment_method_required',
        'payment_method é obrigatório para marcar como pago.',
      );
    }
    const payment_method = parsePaymentMethod(body.payment_method);
    const paid_at = parseOptionalIsoDate(body.paid_at, 'paid_at') ?? new Date();

    const existing = await financialChargeDao.findByIdForClinic(chargeId, actor.clinica_id);
    if (!existing) throw chargeNotFound();
    if (existing.status !== 'pending') throw notPending();

    const updated = await financialChargeDao.markPaid(
      chargeId,
      actor.clinica_id,
      actor.usuario_id,
      payment_method,
      paid_at,
    );
    if (!updated) {
      // CAS miss after read — race window. Generic 400.
      throw notPending();
    }
    await safeAudit('financial.charge.paid.success', updated.id, actor, ctx);
    return { charge: toPublicCharge(updated) };
  },

  // POST /financial/charges/:id/cancel — pending → canceled. ADR 0012 §11.6.
  // Requires effective access 'transact' or 'full'.
  async cancel(
    actor: FinancialActor,
    id: string,
    body: { cancel_reason?: unknown },
    ctx: AuthContext,
  ): Promise<{ charge: PublicFinancialCharge }> {
    const access = effectiveFinancialAccess(actor);
    if (access === 'none') throw forbidden();

    const chargeId = parseUuid(id, 'id');
    const cancel_reason = parseOptionalCancelReason(body.cancel_reason);

    const existing = await financialChargeDao.findByIdForClinic(chargeId, actor.clinica_id);
    if (!existing) throw chargeNotFound();
    if (existing.status !== 'pending') throw notPending();

    const updated = await financialChargeDao.cancel(
      chargeId,
      actor.clinica_id,
      actor.usuario_id,
      cancel_reason,
    );
    if (!updated) {
      throw notPending();
    }
    await safeAudit('financial.charge.canceled.success', updated.id, actor, ctx);
    return { charge: toPublicCharge(updated) };
  },

  // GET /financial/summary — totalizadores. ADR 0012 §11.7.
  // Requires effective access 'transact' or 'full'.
  async summary(
    actor: FinancialActor,
    rawQuery: { date_from?: unknown; date_to?: unknown },
  ): Promise<{ summary: FinancialSummary }> {
    const access = effectiveFinancialAccess(actor);
    if (access === 'none') throw forbidden();

    // Default: paid range = current month.
    const now = new Date();
    const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const defaultTo = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    const from = parseOptionalIsoDate(rawQuery.date_from, 'date_from') ?? defaultFrom;
    const to = parseOptionalIsoDate(rawQuery.date_to, 'date_to') ?? defaultTo;
    if (to.getTime() <= from.getTime()) {
      throw invalid('date_to deve ser maior que date_from.');
    }

    const summary = await financialChargeDao.summarize(actor.clinica_id, from, to);
    return { summary };
  },

  // GET /patients/:id/charges — list charges of a single patient. ADR 0012 §11.8.
  // Requires effective access 'transact' or 'full'.
  async listForPatient(
    actor: FinancialActor,
    patient_id_param: string,
    rawQuery: { limit?: unknown; offset?: unknown },
  ): Promise<{ charges: PublicFinancialChargeListItem[] }> {
    const access = effectiveFinancialAccess(actor);
    if (access === 'none') throw forbidden();

    const patient_id = parseUuid(patient_id_param, 'patient_id');
    const limit = parseLimit(rawQuery.limit);
    const offset = parseOffset(rawQuery.offset);

    const patient = await patientDao.findByIdForClinic(patient_id, actor.clinica_id);
    if (!patient) throw patientNotFound();

    const rows = await financialChargeDao.listForPatient(
      actor.clinica_id,
      patient_id,
      { limit, offset },
    );
    return { charges: rows.map(toListItem) };
  },
};
