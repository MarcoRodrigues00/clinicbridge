import type { Knex } from 'knex';
import { db } from '../config/db';
import type {
  AppointmentRow,
  FinancialChargeRow,
  PatientRow,
} from '../types/db';

// Management Reports v0.1 DAO (Sprint 4.5B; ADR 0014).
//
// Defense-in-depth invariants enforced HERE (independent of any middleware):
//   1. EVERY query is ALWAYS scoped by `clinica_id`. There is no `listAll()`
//      and no method that accepts a missing tenant filter — a missing
//      tenant filter cannot leak cross-clinic data.
//   2. NO method touches clinical_* tables. The whole module is administrative.
//      If a future report requires clinical data, it MUST live in a new ADR
//      and a separate clinical-side DAO (gated by requireClinicalRole).
//   3. NO method returns free-text PII fields (nome, cpf, email, telefone,
//      administrative_notes, notes, cancel_reason, description). Only
//      aggregates / counts and a small set of safe identifiers (ids, dates,
//      statuses) leave this layer.
//   4. NO INSERT / UPDATE / DELETE — report generation is read-only.
//   5. Half-open windows [from, to). Callers translate `date_to` (inclusive
//      calendar day) into `to = date_to + 1 day` so the SQL stays
//      symmetric.

// ---- R-A: Appointments aggregates -----------------------------------------

export interface AppointmentStatusCount {
  status: string;
  count: number;
}

export interface AppointmentReportRange {
  clinica_id: string;
  from: Date;
  to: Date;
  professional_id: string | null;
}

export interface AppointmentAttentionItem {
  appointment_id: string;
  starts_at: Date;
  status: string;
}

const ATTENTION_LIMIT = 20;

// ---- R-B: Financial aggregates --------------------------------------------

export interface FinancialReportRange {
  clinica_id: string;
  from: Date;
  to: Date;
}

export interface FinancialStatusCount {
  status: string;
  total_cents: number;
  count: number;
}

export interface FinancialPaymentMethodCount {
  method: string;
  total_cents: number;
  count: number;
}

// ---- R-C: Patients aggregates ---------------------------------------------

export interface PatientReportRange {
  clinica_id: string;
  from: Date;
  to: Date;
  no_appt_days: number;
}

// ---- R-D: Agenda × Financeiro ---------------------------------------------

export interface AgendaFinancialReportRange {
  clinica_id: string;
  from: Date;
  to: Date;
  professional_id: string | null;
}

export interface AgendaFinancialCounters {
  appointments_total: number;
  with_pending_charge: number;
  with_paid_charge: number;
  with_overdue_charge: number;
  with_canceled_charge: number;
  without_charge: number;
  cancelled_with_pending: number;
  charge_canceled_appt_active: number;
}

function coerceCount(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number(value);
}

export const reportsDao = {
  // ---- R-A ----------------------------------------------------------------

  // status counts in the window [from, to). `professional_id` optional.
  async appointmentStatusCounts(
    range: AppointmentReportRange,
    conn: Knex = db,
  ): Promise<AppointmentStatusCount[]> {
    const q = conn<AppointmentRow>('appointments')
      .where({ clinica_id: range.clinica_id })
      .andWhere('starts_at', '>=', range.from)
      .andWhere('starts_at', '<', range.to);
    if (range.professional_id) {
      q.andWhere({ professional_id: range.professional_id });
    }
    const rows = await q
      .select<{ status: string; count: string | number }[]>('status')
      .count<{ status: string; count: string | number }[]>({ count: '*' })
      .groupBy('status');
    return rows.map((r) => ({ status: r.status, count: coerceCount(r.count) }));
  },

  // Attention list: scheduled/confirmed in the past with no status update.
  // Tight projection — only id + starts_at + status. No patient/professional
  // identifiers in the body (the appointment_id alone is enough to link to
  // the agenda detail view, which already enforces tenant + role).
  async appointmentAttention(
    range: AppointmentReportRange,
    cutoff: Date,
    conn: Knex = db,
  ): Promise<AppointmentAttentionItem[]> {
    const q = conn<AppointmentRow>('appointments')
      .where({ clinica_id: range.clinica_id })
      .andWhere('starts_at', '>=', range.from)
      .andWhere('starts_at', '<', range.to)
      .whereIn('status', ['scheduled', 'confirmed'])
      .andWhere('starts_at', '<', cutoff);
    if (range.professional_id) {
      q.andWhere({ professional_id: range.professional_id });
    }
    const rows = await q
      .select<Array<{ id: string; starts_at: Date; status: string }>>(
        'id',
        'starts_at',
        'status',
      )
      .orderBy('starts_at', 'asc')
      .limit(ATTENTION_LIMIT);
    return rows.map((r: { id: string; starts_at: Date; status: string }) => ({
      appointment_id: r.id,
      starts_at: r.starts_at,
      status: r.status,
    }));
  },

  // Quick existence check used by the service to validate `professional_id`
  // belongs to the same clinic before any aggregation runs.
  async professionalExistsInClinic(
    professional_id: string,
    clinica_id: string,
    conn: Knex = db,
  ): Promise<boolean> {
    const row = await conn('clinic_professionals')
      .where({ id: professional_id, clinica_id })
      .first('id');
    return !!row;
  },

  // ---- R-B ----------------------------------------------------------------

  // Paid charges: window applies to `paid_at` (when the money came in).
  async financialPaidInWindow(
    range: FinancialReportRange,
    conn: Knex = db,
  ): Promise<{ total_cents: number; count: number }> {
    const row = await conn<FinancialChargeRow>('financial_charges')
      .where({ clinica_id: range.clinica_id, status: 'paid' })
      .andWhere('paid_at', '>=', range.from)
      .andWhere('paid_at', '<', range.to)
      .select<{ total: string | null; count: string }[]>(
        conn.raw('COALESCE(SUM(amount_cents), 0) as total'),
        conn.raw('COUNT(*) as count'),
      )
      .first();
    return {
      total_cents: coerceCount(row?.total ?? null),
      count: coerceCount(row?.count),
    };
  },

  // Canceled charges: window applies to `canceled_at`.
  async financialCanceledInWindow(
    range: FinancialReportRange,
    conn: Knex = db,
  ): Promise<{ total_cents: number; count: number }> {
    const row = await conn<FinancialChargeRow>('financial_charges')
      .where({ clinica_id: range.clinica_id, status: 'canceled' })
      .andWhere('canceled_at', '>=', range.from)
      .andWhere('canceled_at', '<', range.to)
      .select<{ total: string | null; count: string }[]>(
        conn.raw('COALESCE(SUM(amount_cents), 0) as total'),
        conn.raw('COUNT(*) as count'),
      )
      .first();
    return {
      total_cents: coerceCount(row?.total ?? null),
      count: coerceCount(row?.count),
    };
  },

  // Pending charges: full open balance (NOT windowed). ADR 0014 §3.3.
  async financialPendingTotal(
    clinica_id: string,
    conn: Knex = db,
  ): Promise<{ total_cents: number; count: number }> {
    const row = await conn<FinancialChargeRow>('financial_charges')
      .where({ clinica_id, status: 'pending' })
      .select<{ total: string | null; count: string }[]>(
        conn.raw('COALESCE(SUM(amount_cents), 0) as total'),
        conn.raw('COUNT(*) as count'),
      )
      .first();
    return {
      total_cents: coerceCount(row?.total ?? null),
      count: coerceCount(row?.count),
    };
  },

  // Overdue: pending AND due_date < current_date.
  async financialOverdueTotal(
    clinica_id: string,
    conn: Knex = db,
  ): Promise<{ total_cents: number; count: number }> {
    const row = await conn<FinancialChargeRow>('financial_charges')
      .where({ clinica_id, status: 'pending' })
      .andWhere('due_date', '<', conn.raw('current_date'))
      .select<{ total: string | null; count: string }[]>(
        conn.raw('COALESCE(SUM(amount_cents), 0) as total'),
        conn.raw('COUNT(*) as count'),
      )
      .first();
    return {
      total_cents: coerceCount(row?.total ?? null),
      count: coerceCount(row?.count),
    };
  },

  // Paid by payment_method in window. Empty array when nothing paid.
  async financialPaidByMethod(
    range: FinancialReportRange,
    conn: Knex = db,
  ): Promise<FinancialPaymentMethodCount[]> {
    const rows = await conn<FinancialChargeRow>('financial_charges')
      .where({ clinica_id: range.clinica_id, status: 'paid' })
      .andWhere('paid_at', '>=', range.from)
      .andWhere('paid_at', '<', range.to)
      .whereNotNull('payment_method')
      .select<{ payment_method: string; total: string | null; count: string }[]>(
        'payment_method',
        conn.raw('COALESCE(SUM(amount_cents), 0) as total'),
        conn.raw('COUNT(*) as count'),
      )
      .groupBy('payment_method')
      .orderBy('payment_method', 'asc');
    return rows.map((r) => ({
      method: r.payment_method,
      total_cents: coerceCount(r.total ?? null),
      count: coerceCount(r.count),
    }));
  },

  // ---- R-C ----------------------------------------------------------------

  async patientStatusCounts(
    clinica_id: string,
    conn: Knex = db,
  ): Promise<{ status: string; count: number }[]> {
    const rows = await conn<PatientRow>('patients')
      .where({ clinica_id })
      .whereNull('merged_into_id')
      .select<{ status: string; count: string | number }[]>('status')
      .count<{ status: string; count: string | number }[]>({ count: '*' })
      .groupBy('status');
    return rows.map((r) => ({ status: r.status, count: coerceCount(r.count) }));
  },

  async patientsNewInWindow(
    range: PatientReportRange,
    conn: Knex = db,
  ): Promise<number> {
    const row = await conn<PatientRow>('patients')
      .where({ clinica_id: range.clinica_id })
      .whereNull('merged_into_id')
      .andWhere('criado_em', '>=', range.from)
      .andWhere('criado_em', '<', range.to)
      .count<{ count: string }>({ count: '*' })
      .first();
    return coerceCount(row?.count);
  },

  // Distinct active patients with at least one appointment whose starts_at
  // falls in the window. Status filter on appointment is intentionally absent
  // (a `cancelled` appointment still represents a touchpoint).
  async patientsWithAppointmentInWindow(
    range: PatientReportRange,
    conn: Knex = db,
  ): Promise<number> {
    const row = await conn('appointments as a')
      .innerJoin('patients as p', function () {
        this.on('p.id', '=', 'a.patient_id').andOn(
          'p.clinica_id',
          '=',
          'a.clinica_id',
        );
      })
      .where('a.clinica_id', range.clinica_id)
      .andWhere('a.starts_at', '>=', range.from)
      .andWhere('a.starts_at', '<', range.to)
      .andWhere('p.status', 'active')
      .whereNull('p.merged_into_id')
      .countDistinct<{ count: string }>({ count: 'a.patient_id' })
      .first();
    return coerceCount(row?.count);
  },

  // Active patients with NO appointment in the last N days. Cutoff is
  // computed at the service to keep "today" consistent across counters.
  async patientsWithoutRecentAppointment(
    clinica_id: string,
    cutoff: Date,
    conn: Knex = db,
  ): Promise<number> {
    // NOT EXISTS subquery — never returns patient identifiers.
    const row = await conn<PatientRow>('patients as p')
      .where('p.clinica_id', clinica_id)
      .andWhere('p.status', 'active')
      .whereNull('p.merged_into_id')
      .whereNotExists(function () {
        this.select('*')
          .from('appointments as a')
          .whereRaw('a.patient_id = p.id')
          .andWhere('a.clinica_id', clinica_id)
          .andWhere('a.starts_at', '>=', cutoff);
      })
      .count<{ count: string }>({ count: '*' })
      .first();
    return coerceCount(row?.count);
  },

  // ---- R-D ----------------------------------------------------------------

  // Appointment + most-recent-charge join in [from, to). Aggregates only.
  // Returns 8 counters; no row identifiers leave this method.
  async agendaFinancialCounters(
    range: AgendaFinancialReportRange,
    conn: Knex = db,
  ): Promise<AgendaFinancialCounters> {
    // Pure raw SQL keeps the latest-charge-per-appointment join readable. All
    // input values are bound (?) — no concatenation, no interpolation. Output
    // is row-grouped counters; no PII columns are projected.
    const params: Array<string | Date> = [
      range.clinica_id, // latest_charges CTE filter
      range.clinica_id, // outer appointments filter
      range.from,
      range.to,
    ];
    let professionalFilter = '';
    if (range.professional_id) {
      professionalFilter = 'AND a.professional_id = ?';
      params.push(range.professional_id);
    }

    const sql = `
      WITH latest_charges AS (
        SELECT DISTINCT ON (fc.appointment_id)
          fc.appointment_id,
          fc.status,
          fc.due_date
        FROM financial_charges fc
        WHERE fc.clinica_id = ?
          AND fc.appointment_id IS NOT NULL
        ORDER BY fc.appointment_id, fc.created_at DESC
      )
      SELECT
        CASE
          WHEN c.appointment_id IS NULL THEN 'no_charge'
          WHEN c.status = 'paid' THEN 'paid'
          WHEN c.status = 'canceled' THEN 'charge_canceled'
          WHEN c.status = 'pending'
               AND c.due_date IS NOT NULL
               AND c.due_date < CURRENT_DATE THEN 'overdue'
          WHEN c.status = 'pending' THEN 'pending'
          ELSE 'other'
        END AS bucket,
        a.status AS appt_status,
        COUNT(*)::bigint AS count
      FROM appointments a
      LEFT JOIN latest_charges c ON c.appointment_id = a.id
      WHERE a.clinica_id = ?
        AND a.starts_at >= ?
        AND a.starts_at < ?
        ${professionalFilter}
      GROUP BY 1, 2
    `;

    const result = await conn.raw<{
      rows: Array<{ bucket: string; appt_status: string; count: string | number }>;
    }>(sql, params);
    const bucketRows = result.rows;

    let appointments_total = 0;
    let with_paid_charge = 0;
    let with_pending_charge = 0;
    let with_overdue_charge = 0;
    let with_canceled_charge = 0;
    let without_charge = 0;
    let cancelled_with_pending = 0;
    let charge_canceled_appt_active = 0;

    for (const row of bucketRows) {
      const c = coerceCount(row.count);
      appointments_total += c;
      const bucket = row.bucket;
      const apptStatus = row.appt_status;

      if (bucket === 'paid') with_paid_charge += c;
      else if (bucket === 'pending') {
        with_pending_charge += c;
        if (apptStatus === 'cancelled') cancelled_with_pending += c;
      } else if (bucket === 'overdue') {
        with_overdue_charge += c;
        if (apptStatus === 'cancelled') cancelled_with_pending += c;
      } else if (bucket === 'charge_canceled') {
        with_canceled_charge += c;
        if (apptStatus !== 'cancelled') charge_canceled_appt_active += c;
      } else if (bucket === 'no_charge') without_charge += c;
      // 'other' silently dropped (defensive — should not occur given the CASE).
    }

    return {
      appointments_total,
      with_pending_charge,
      with_paid_charge,
      with_overdue_charge,
      with_canceled_charge,
      without_charge,
      cancelled_with_pending,
      charge_canceled_appt_active,
    };
  },
};
