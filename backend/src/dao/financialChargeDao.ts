import type { Knex } from 'knex';
import { db } from '../config/db';
import type {
  FinancialChargeRow,
  FinancialChargeStatus,
  FinancialPaymentMethod,
} from '../types/db';

// financial_charges DAO (Sprint 4.4B; ADR 0012).
//
// Defense-in-depth invariants enforced HERE (independent of any middleware):
//   1. EVERY read and write is ALWAYS scoped by `clinica_id`. There is no
//      `listAll()` and no `findById()` without a clinic — a missing tenant
//      filter cannot leak cross-clinic charges.
//   2. NO physical DELETE method. ADR 0012 §2.3. `canceled` is the terminal
//      negative state.
//   3. updatePending / markPaid / cancel are CAS UPDATEs that include
//      `status='pending'` in the WHERE clause. A row that is already paid or
//      canceled silently misses the CAS and surfaces as a generic 400
//      `charge_not_pending` at the service.
//   4. There is NO method that updates `amount_cents`, `description`,
//      `due_date`, or `notes` once status != 'pending' — by construction.
//   5. There is NO method that mutates `clinica_id`, `patient_id`,
//      `appointment_id`, `created_by_user_id`, or `currency` after creation.
//
// Financial × clinical separation: this DAO never JOINs against any clinical
// table. The agenda integration is by FK only; clinical_* tables are not
// touched. ADR 0012 §7.1.
export interface CreateFinancialChargeInput {
  clinica_id: string;
  patient_id: string;
  appointment_id: string | null;
  created_by_user_id: string;
  description: string;
  amount_cents: number;
  due_date: string | null;
  notes: string | null;
}

export interface UpdatePendingFields {
  description?: string;
  amount_cents?: number;
  due_date?: string | null;
  notes?: string | null;
  appointment_id?: string | null;
}

export interface ListFinancialChargesFilters {
  patient_id?: string | null;
  appointment_id?: string | null;
  status?: FinancialChargeStatus | null;
  from?: Date | null;
  to?: Date | null;
  limit: number;
  offset: number;
}

export interface FinancialSummary {
  pending_amount_cents: number;
  paid_amount_cents: number;
  overdue_amount_cents: number;
  pending_count: number;
  paid_count: number;
  overdue_count: number;
}

export const financialChargeDao = {
  async create(
    input: CreateFinancialChargeInput,
    conn: Knex = db,
  ): Promise<FinancialChargeRow> {
    const [row] = await conn<FinancialChargeRow>('financial_charges')
      .insert({
        clinica_id: input.clinica_id,
        patient_id: input.patient_id,
        appointment_id: input.appointment_id,
        created_by_user_id: input.created_by_user_id,
        description: input.description,
        amount_cents: input.amount_cents,
        currency: 'BRL',
        due_date: input.due_date,
        status: 'pending',
        notes: input.notes,
      })
      .returning('*');
    if (!row) {
      throw new Error('financialChargeDao.create: insert returned no row');
    }
    return row;
  },

  // Tenant-scoped fetch. Returns undefined for cross-clinic id — service
  // surfaces a generic 404.
  async findByIdForClinic(
    id: string,
    clinica_id: string,
    conn: Knex = db,
  ): Promise<FinancialChargeRow | undefined> {
    return conn<FinancialChargeRow>('financial_charges')
      .where({ id, clinica_id })
      .first();
  },

  async listForClinic(
    clinica_id: string,
    filters: ListFinancialChargesFilters,
    conn: Knex = db,
  ): Promise<FinancialChargeRow[]> {
    const query = conn<FinancialChargeRow>('financial_charges').where({ clinica_id });
    if (filters.patient_id) query.andWhere({ patient_id: filters.patient_id });
    if (filters.appointment_id) {
      query.andWhere({ appointment_id: filters.appointment_id });
    }
    if (filters.status) query.andWhere({ status: filters.status });
    if (filters.from) query.andWhere('created_at', '>=', filters.from);
    if (filters.to) query.andWhere('created_at', '<', filters.to);
    return query
      .orderBy('created_at', 'desc')
      .limit(filters.limit)
      .offset(filters.offset);
  },

  // Tenant-scoped list for a single patient. Used by GET /patients/:id/charges.
  async listForPatient(
    clinica_id: string,
    patient_id: string,
    options: { limit: number; offset: number },
    conn: Knex = db,
  ): Promise<FinancialChargeRow[]> {
    return conn<FinancialChargeRow>('financial_charges')
      .where({ clinica_id, patient_id })
      .orderBy('created_at', 'desc')
      .limit(options.limit)
      .offset(options.offset);
  },

  // Compare-and-set update for pending charges. Only fields present in `patch`
  // are written. WHERE clause requires (id, clinica_id, status='pending').
  // A missed CAS — non-existent / cross-tenant / already paid / already
  // canceled — returns undefined; service surfaces as 400 `charge_not_pending`
  // (when row exists in another status) or 404 (when truly not found). The
  // service re-reads the row before calling this to disambiguate the two.
  async updatePending(
    id: string,
    clinica_id: string,
    patch: UpdatePendingFields,
    conn: Knex = db,
  ): Promise<FinancialChargeRow | undefined> {
    const updates: Record<string, unknown> = { updated_at: conn.fn.now() };
    if (patch.description !== undefined) updates.description = patch.description;
    if (patch.amount_cents !== undefined) updates.amount_cents = patch.amount_cents;
    if (patch.due_date !== undefined) updates.due_date = patch.due_date;
    if (patch.notes !== undefined) updates.notes = patch.notes;
    if (patch.appointment_id !== undefined) updates.appointment_id = patch.appointment_id;

    const [row] = await conn<FinancialChargeRow>('financial_charges')
      .where({ id, clinica_id, status: 'pending' })
      .update(updates)
      .returning('*');
    return row;
  },

  // Compare-and-set transition pending → paid. WHERE requires
  // (id, clinica_id, status='pending'). Sets paid_at + paid_by_user_id +
  // payment_method atomically.
  async markPaid(
    id: string,
    clinica_id: string,
    paid_by_user_id: string,
    payment_method: FinancialPaymentMethod,
    paid_at: Date,
    conn: Knex = db,
  ): Promise<FinancialChargeRow | undefined> {
    const [row] = await conn<FinancialChargeRow>('financial_charges')
      .where({ id, clinica_id, status: 'pending' })
      .update({
        status: 'paid',
        paid_at,
        paid_by_user_id,
        payment_method,
        updated_at: conn.fn.now(),
      })
      .returning('*');
    return row;
  },

  // Compare-and-set transition pending → canceled. WHERE requires
  // (id, clinica_id, status='pending'). Sets canceled_at + canceled_by_user_id
  // + (optional) cancel_reason atomically.
  async cancel(
    id: string,
    clinica_id: string,
    canceled_by_user_id: string,
    cancel_reason: string | null,
    conn: Knex = db,
  ): Promise<FinancialChargeRow | undefined> {
    const [row] = await conn<FinancialChargeRow>('financial_charges')
      .where({ id, clinica_id, status: 'pending' })
      .update({
        status: 'canceled',
        canceled_at: conn.fn.now(),
        canceled_by_user_id,
        cancel_reason,
        updated_at: conn.fn.now(),
      })
      .returning('*');
    return row;
  },

  // Tenant-scoped aggregates for the dashboard totalizadores (ADR 0012 §4.4).
  // Date range applies to `paid_at` for paid_amount/paid_count; pending is
  // computed against `due_date` semantics (overdue = pending AND due_date < today).
  //
  // Returns numeric values already cast to JS Number — pg returns SUM as a
  // string for bigint, so we COALESCE+cast at the DB and parse here.
  async summarize(
    clinica_id: string,
    paid_from: Date | null,
    paid_to: Date | null,
    conn: Knex = db,
  ): Promise<FinancialSummary> {
    // Pending — not yet due (or no due date).
    const pendingQuery = conn<FinancialChargeRow>('financial_charges')
      .where({ clinica_id, status: 'pending' })
      .andWhere((qb) => {
        qb.whereNull('due_date').orWhere('due_date', '>=', conn.raw('current_date'));
      });
    const pendingRow = await pendingQuery
      .clone()
      .count<{ count: string }[]>('* as count')
      .first();
    const pendingSum = await pendingQuery
      .clone()
      .sum<{ sum: string | null }[]>('amount_cents as sum')
      .first();

    // Overdue — pending AND due_date < today.
    const overdueQuery = conn<FinancialChargeRow>('financial_charges')
      .where({ clinica_id, status: 'pending' })
      .andWhere('due_date', '<', conn.raw('current_date'));
    const overdueRow = await overdueQuery
      .clone()
      .count<{ count: string }[]>('* as count')
      .first();
    const overdueSum = await overdueQuery
      .clone()
      .sum<{ sum: string | null }[]>('amount_cents as sum')
      .first();

    // Paid — within window [paid_from, paid_to). When either is null, omit
    // that side of the bound.
    const paidQuery = conn<FinancialChargeRow>('financial_charges').where({
      clinica_id,
      status: 'paid',
    });
    if (paid_from) paidQuery.andWhere('paid_at', '>=', paid_from);
    if (paid_to) paidQuery.andWhere('paid_at', '<', paid_to);
    const paidRow = await paidQuery
      .clone()
      .count<{ count: string }[]>('* as count')
      .first();
    const paidSum = await paidQuery
      .clone()
      .sum<{ sum: string | null }[]>('amount_cents as sum')
      .first();

    return {
      pending_amount_cents: Number(pendingSum?.sum ?? 0),
      pending_count: Number(pendingRow?.count ?? 0),
      overdue_amount_cents: Number(overdueSum?.sum ?? 0),
      overdue_count: Number(overdueRow?.count ?? 0),
      paid_amount_cents: Number(paidSum?.sum ?? 0),
      paid_count: Number(paidRow?.count ?? 0),
    };
  },
};
