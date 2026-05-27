import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import { reportsDao } from '../dao/reportsDao';
import { userClinicalRoleDao } from '../dao/userClinicalRoleDao';
import { HttpError } from '../middlewares/errorHandler';
import type { UserClinicalRoleName, UserPapel } from '../types/db';
import type { AuthContext } from './authService';
import { effectiveFinancialAccess } from './financialChargeService';

// Management Reports v0.1 service (Sprint 4.5B; ADR 0014).
//
// Architecture:
//   - 4 read-only endpoints over EXISTING administrative/financial tables.
//   - No migration, no new table, no export, no clinical data.
//   - All endpoints behind `requireAuth + requireClinic + requireRole(['dono','sec'])`.
//   - R-B (financial) and R-D (agenda × financeiro) additionally require
//     `effectiveFinancialAccess !== 'none'` — same gate the Financeiro v0.1
//     uses (ADR 0012 §7.2). Profissional grant → 403.
//
// Response invariants (ADR 0014 §7):
//   - Counts and monetary aggregates only. No patient name/cpf/email/phone.
//     No `administrative_notes` (appointments). No `notes` / `cancel_reason`
//     / `description` (financial_charges). No clinical fields ever.
//   - `attention` lists are tightly projected: only ids + minimal metadata.
//
// Audit (§7.2):
//   - On success: `report.<type>.view.success`, `recurso='report'`,
//     `recurso_id='<type>:<from>:<to>'`. No PII in any field.
//   - Best-effort; an audit write failure does NOT abort the response.

// ----- Types ----------------------------------------------------------------

export interface ReportActorInput {
  clinica_id: string;
  usuario_id: string;
  papel: UserPapel;
}

export interface ReportActor extends ReportActorInput {
  clinical_grants: Set<UserClinicalRoleName>;
}

// ----- Constants ------------------------------------------------------------

const MAX_INTERVAL_DAYS = 366;
const SOFT_LOOKBACK_YEARS = 2;
// Soft lower bound for date_from: ~2 calendar years before today. Avoids
// accidental full-history scans on growing clinics. Uses 366 to be generous
// across leap years.
const SOFT_LOOKBACK_DAYS = SOFT_LOOKBACK_YEARS * 366;
const NO_APPT_DAYS_DEFAULT = 90;
const NO_APPT_DAYS_MAX = 365;
const NO_APPT_DAYS_MIN = 1;
// Attention list cutoff: appointments still 'scheduled' or 'confirmed' that
// were due more than this many days ago.
const ATTENTION_PAST_DAYS = 3;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ----- Errors ---------------------------------------------------------------

function invalidFilters(message: string): HttpError {
  return new HttpError(400, 'report_invalid_filters', message);
}

function forbiddenFinancial(): HttpError {
  // Same shape as financial v0.1 forbidden (ADR 0012 §7.2).
  return new HttpError(
    403,
    'forbidden_role',
    'Você não tem permissão para acessar este relatório.',
  );
}

// ----- Date helpers ---------------------------------------------------------

interface ParsedRange {
  // Half-open window [from, to). `to` is `date_to + 1 day` so the SQL stays
  // symmetric (>= from AND < to).
  from: Date;
  to: Date;
  // Original strings echoed in the response and in `recurso_id`. Already
  // validated as YYYY-MM-DD.
  date_from: string;
  date_to: string;
}

function parseYmd(value: unknown, field: string): { date: Date; iso: string } {
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    throw invalidFilters(`${field} deve estar no formato YYYY-MM-DD.`);
  }
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw invalidFilters(`${field} inválido.`);
  }
  // Round-trip check: rejects values like 2026-02-30 that JS silently rolls
  // forward.
  const iso = d.toISOString().slice(0, 10);
  if (iso !== value) {
    throw invalidFilters(`${field} inválido.`);
  }
  return { date: d, iso };
}

function defaultMonthStart(now: Date): { date: Date; iso: string } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { date: d, iso: d.toISOString().slice(0, 10) };
}

function defaultToday(now: Date): { date: Date; iso: string } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { date: d, iso: d.toISOString().slice(0, 10) };
}

function parseRange(raw: {
  date_from?: unknown;
  date_to?: unknown;
}): ParsedRange {
  const now = new Date();
  const from = raw.date_from === undefined || raw.date_from === null || raw.date_from === ''
    ? defaultMonthStart(now)
    : parseYmd(raw.date_from, 'date_from');
  const to = raw.date_to === undefined || raw.date_to === null || raw.date_to === ''
    ? defaultToday(now)
    : parseYmd(raw.date_to, 'date_to');

  if (to.date.getTime() < from.date.getTime()) {
    throw invalidFilters('date_to deve ser maior ou igual a date_from.');
  }

  const ms = to.date.getTime() - from.date.getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days > MAX_INTERVAL_DAYS) {
    throw invalidFilters(`Intervalo máximo é de ${MAX_INTERVAL_DAYS} dias.`);
  }

  const softFloor = new Date(now.getTime() - SOFT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  if (from.date.getTime() < softFloor.getTime()) {
    throw invalidFilters(
      `date_from não pode ser anterior a ${SOFT_LOOKBACK_YEARS} anos atrás.`,
    );
  }

  // [from, to) — translate inclusive date_to into exclusive `to` by adding 1 day.
  const toExclusive = new Date(to.date.getTime() + 24 * 60 * 60 * 1000);

  return {
    from: from.date,
    to: toExclusive,
    date_from: from.iso,
    date_to: to.iso,
  };
}

function parseOptionalProfessionalId(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw invalidFilters('professional_id inválido.');
  }
  return value;
}

function parseNoApptDays(value: unknown): number {
  if (value === undefined || value === null || value === '') return NO_APPT_DAYS_DEFAULT;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw invalidFilters('no_appt_days inválido.');
  }
  const n = Number(value);
  if (n < NO_APPT_DAYS_MIN || n > NO_APPT_DAYS_MAX) {
    throw invalidFilters(
      `no_appt_days deve estar entre ${NO_APPT_DAYS_MIN} e ${NO_APPT_DAYS_MAX}.`,
    );
  }
  return n;
}

// ----- Actor / authorization -----------------------------------------------

export async function buildReportActor(input: ReportActorInput): Promise<ReportActor> {
  const grants = await userClinicalRoleDao.listActiveRoleNames(
    input.usuario_id,
    input.clinica_id,
  );
  return { ...input, clinical_grants: new Set(grants) };
}

function assertFinancialReportAccess(actor: ReportActor): void {
  const access = effectiveFinancialAccess(actor);
  if (access === 'none') throw forbiddenFinancial();
}

// ----- Audit helper ---------------------------------------------------------

async function safeAuditReportView(
  reportType: string,
  date_from: string,
  date_to: string,
  actor: ReportActor,
  ctx: AuthContext,
): Promise<void> {
  try {
    // `recurso_id` carries ONLY: report type + ISO date window. No PII, no
    // counters, no monetary values. Audited as evidence of access, not as a
    // copy of the payload.
    await auditLogDao.create({
      acao: `report.${reportType}.view.success`,
      usuario_id: actor.usuario_id,
      clinica_id: actor.clinica_id,
      recurso: 'report',
      recurso_id: `${reportType}:${date_from}:${date_to}`,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
    });
  } catch (err) {
    // Best-effort; do not abort. Mirrors financialChargeService.safeAudit.
    logger.error(
      { err, acao: `report.${reportType}.view.success`, audit_write_failed: true },
      'audit log write failed',
    );
  }
}

// ----- Response shapes ------------------------------------------------------

export interface AppointmentsReportResponse {
  report: 'appointments';
  date_from: string;
  date_to: string;
  professional_id: string | null;
  data: {
    total: number;
    scheduled: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    rescheduled: number;
    no_show: number;
    attendance_rate: number;
  };
  attention: Array<{ appointment_id: string; starts_at: string; status: string }>;
  generated_at: string;
}

export interface FinancialReportResponse {
  report: 'financial';
  date_from: string;
  date_to: string;
  data: {
    received_cents: number;
    pending_cents: number;
    overdue_cents: number;
    canceled_cents: number;
    count_paid: number;
    count_pending: number;
    count_overdue: number;
    count_canceled: number;
    by_payment_method: Array<{ method: string; total_cents: number; count: number }>;
  };
  generated_at: string;
}

export interface PatientsReportResponse {
  report: 'patients';
  date_from: string;
  date_to: string;
  no_appt_days: number;
  data: {
    total_active: number;
    total_archived: number;
    new_in_period: number;
    with_appointment_in_period: number;
    without_recent_appointment: number;
  };
  generated_at: string;
}

export interface AgendaFinancialReportResponse {
  report: 'agenda-financial';
  date_from: string;
  date_to: string;
  professional_id: string | null;
  data: {
    appointments_total: number;
    with_pending_charge: number;
    with_paid_charge: number;
    with_overdue_charge: number;
    with_canceled_charge: number;
    without_charge: number;
    cancelled_with_pending: number;
    charge_canceled_appt_active: number;
  };
  generated_at: string;
}

// ----- Service --------------------------------------------------------------

export const reportsService = {
  buildActor: buildReportActor,

  // R-A — GET /reports/appointments. Open to dono_clinica + secretaria (any
  // grant). Profissional/admin are blocked by requireRole/requireClinic before
  // we ever get here.
  async appointments(
    actor: ReportActor,
    rawQuery: {
      date_from?: unknown;
      date_to?: unknown;
      professional_id?: unknown;
    },
    ctx: AuthContext,
  ): Promise<AppointmentsReportResponse> {
    const range = parseRange(rawQuery);
    const professional_id = parseOptionalProfessionalId(rawQuery.professional_id);

    if (professional_id) {
      const ok = await reportsDao.professionalExistsInClinic(
        professional_id,
        actor.clinica_id,
      );
      if (!ok) throw invalidFilters('professional_id inválido.');
    }

    const counts = await reportsDao.appointmentStatusCounts({
      clinica_id: actor.clinica_id,
      from: range.from,
      to: range.to,
      professional_id,
    });

    const buckets = {
      scheduled: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
      rescheduled: 0,
      no_show: 0,
    };
    let total = 0;
    for (const row of counts) {
      total += row.count;
      if (row.status in buckets) {
        (buckets as Record<string, number>)[row.status] += row.count;
      }
    }
    const denom = total > 0 ? total : 1;
    const attendance_rate =
      total > 0
        ? Number(((buckets.completed + buckets.confirmed) / denom).toFixed(4))
        : 0;

    // Attention list: scheduled/confirmed in the past with no status update
    // (i.e., starts_at < today - 3 days within the window).
    const now = new Date();
    const cutoff = new Date(now.getTime() - ATTENTION_PAST_DAYS * 24 * 60 * 60 * 1000);
    const attentionRows = await reportsDao.appointmentAttention(
      {
        clinica_id: actor.clinica_id,
        from: range.from,
        to: range.to,
        professional_id,
      },
      cutoff,
    );
    const attention = attentionRows.map((r) => ({
      appointment_id: r.appointment_id,
      starts_at: new Date(r.starts_at).toISOString(),
      status: r.status,
    }));

    await safeAuditReportView('appointments', range.date_from, range.date_to, actor, ctx);

    return {
      report: 'appointments',
      date_from: range.date_from,
      date_to: range.date_to,
      professional_id,
      data: {
        total,
        scheduled: buckets.scheduled,
        confirmed: buckets.confirmed,
        completed: buckets.completed,
        cancelled: buckets.cancelled,
        rescheduled: buckets.rescheduled,
        no_show: buckets.no_show,
        attendance_rate,
      },
      attention,
      generated_at: now.toISOString(),
    };
  },

  // R-B — GET /reports/financial. Requires effectiveFinancialAccess !== 'none'.
  async financial(
    actor: ReportActor,
    rawQuery: { date_from?: unknown; date_to?: unknown },
    ctx: AuthContext,
  ): Promise<FinancialReportResponse> {
    assertFinancialReportAccess(actor);
    const range = parseRange(rawQuery);

    const [paid, canceled, pending, overdue, byMethod] = await Promise.all([
      reportsDao.financialPaidInWindow({
        clinica_id: actor.clinica_id,
        from: range.from,
        to: range.to,
      }),
      reportsDao.financialCanceledInWindow({
        clinica_id: actor.clinica_id,
        from: range.from,
        to: range.to,
      }),
      reportsDao.financialPendingTotal(actor.clinica_id),
      reportsDao.financialOverdueTotal(actor.clinica_id),
      reportsDao.financialPaidByMethod({
        clinica_id: actor.clinica_id,
        from: range.from,
        to: range.to,
      }),
    ]);

    await safeAuditReportView('financial', range.date_from, range.date_to, actor, ctx);

    return {
      report: 'financial',
      date_from: range.date_from,
      date_to: range.date_to,
      data: {
        received_cents: paid.total_cents,
        pending_cents: pending.total_cents,
        overdue_cents: overdue.total_cents,
        canceled_cents: canceled.total_cents,
        count_paid: paid.count,
        count_pending: pending.count,
        count_overdue: overdue.count,
        count_canceled: canceled.count,
        by_payment_method: byMethod,
      },
      generated_at: new Date().toISOString(),
    };
  },

  // R-C — GET /reports/patients. Open to dono + secretaria (any grant).
  async patients(
    actor: ReportActor,
    rawQuery: { date_from?: unknown; date_to?: unknown; no_appt_days?: unknown },
    ctx: AuthContext,
  ): Promise<PatientsReportResponse> {
    const range = parseRange(rawQuery);
    const no_appt_days = parseNoApptDays(rawQuery.no_appt_days);

    const now = new Date();
    const cutoff = new Date(now.getTime() - no_appt_days * 24 * 60 * 60 * 1000);

    const [statusCounts, newInPeriod, withAppt, withoutRecent] = await Promise.all([
      reportsDao.patientStatusCounts(actor.clinica_id),
      reportsDao.patientsNewInWindow({
        clinica_id: actor.clinica_id,
        from: range.from,
        to: range.to,
        no_appt_days,
      }),
      reportsDao.patientsWithAppointmentInWindow({
        clinica_id: actor.clinica_id,
        from: range.from,
        to: range.to,
        no_appt_days,
      }),
      reportsDao.patientsWithoutRecentAppointment(actor.clinica_id, cutoff),
    ]);

    let total_active = 0;
    let total_archived = 0;
    for (const row of statusCounts) {
      if (row.status === 'active') total_active = row.count;
      else if (row.status === 'archived') total_archived = row.count;
    }

    await safeAuditReportView('patients', range.date_from, range.date_to, actor, ctx);

    return {
      report: 'patients',
      date_from: range.date_from,
      date_to: range.date_to,
      no_appt_days,
      data: {
        total_active,
        total_archived,
        new_in_period: newInPeriod,
        with_appointment_in_period: withAppt,
        without_recent_appointment: withoutRecent,
      },
      generated_at: now.toISOString(),
    };
  },

  // R-D — GET /reports/agenda-financial. Requires effectiveFinancialAccess
  // !== 'none'.
  async agendaFinancial(
    actor: ReportActor,
    rawQuery: {
      date_from?: unknown;
      date_to?: unknown;
      professional_id?: unknown;
    },
    ctx: AuthContext,
  ): Promise<AgendaFinancialReportResponse> {
    assertFinancialReportAccess(actor);
    const range = parseRange(rawQuery);
    const professional_id = parseOptionalProfessionalId(rawQuery.professional_id);

    if (professional_id) {
      const ok = await reportsDao.professionalExistsInClinic(
        professional_id,
        actor.clinica_id,
      );
      if (!ok) throw invalidFilters('professional_id inválido.');
    }

    const counters = await reportsDao.agendaFinancialCounters({
      clinica_id: actor.clinica_id,
      from: range.from,
      to: range.to,
      professional_id,
    });

    await safeAuditReportView(
      'agenda-financial',
      range.date_from,
      range.date_to,
      actor,
      ctx,
    );

    return {
      report: 'agenda-financial',
      date_from: range.date_from,
      date_to: range.date_to,
      professional_id,
      data: counters,
      generated_at: new Date().toISOString(),
    };
  },
};
