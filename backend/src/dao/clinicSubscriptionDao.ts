import type { Knex } from 'knex';
import { db } from '../config/db';
import type {
  BillingProviderName,
  ClinicSubscriptionRow,
  PlanCode,
  SubscriptionStatus,
} from '../types/db';

// clinic_subscriptions DAO — Sprint 5.1B (ADR 0018).
//
// Tenant-scoped invariants enforced HERE (independent of any middleware):
//   1. Every read/write is keyed by `clinica_id`. There is NO `listAll()` and
//      no `findById()` without a clinic — a missing tenant filter cannot leak
//      another clinic's subscription.
//   2. ONE subscription per tenant (the table has UNIQUE(clinica_id)); `create`
//      relies on that and surfaces a duplicate as a 23505 the service maps to a
//      generic conflict.
//   3. `updateStatus` is a CAS UPDATE keyed by (clinica_id, expected from-state)
//      so a stale transition silently misses instead of clobbering.
//   4. NO physical DELETE method (the commercial relationship transitions via
//      `status`, never a hard delete that would orphan provider maps/events).

export interface CreateSubscriptionInput {
  clinica_id: string;
  plan_code: PlanCode;
  status: SubscriptionStatus;
  provider: BillingProviderName | null;
  created_by_user_id: string | null;
  trial_ends_at?: Date | null;
  current_period_start?: Date | null;
  current_period_end?: Date | null;
  grace_until?: Date | null;
}

export const clinicSubscriptionDao = {
  async findByClinic(
    clinica_id: string,
    conn: Knex = db,
  ): Promise<ClinicSubscriptionRow | undefined> {
    return conn<ClinicSubscriptionRow>('clinic_subscriptions')
      .where({ clinica_id })
      .first();
  },

  async create(
    input: CreateSubscriptionInput,
    conn: Knex = db,
  ): Promise<ClinicSubscriptionRow> {
    const [row] = await conn<ClinicSubscriptionRow>('clinic_subscriptions')
      .insert({
        clinica_id: input.clinica_id,
        plan_code: input.plan_code,
        status: input.status,
        provider: input.provider,
        created_by_user_id: input.created_by_user_id,
        trial_ends_at: input.trial_ends_at ?? null,
        current_period_start: input.current_period_start ?? null,
        current_period_end: input.current_period_end ?? null,
        grace_until: input.grace_until ?? null,
        canceled_at: input.status === 'canceled' ? conn.fn.now() : null,
      })
      .returning('*');
    if (!row) {
      throw new Error('clinicSubscriptionDao.create: insert returned no row');
    }
    return row;
  },

  // Compare-and-set status transition. WHERE requires (clinica_id, expected
  // from-status) so a concurrent transition that already moved the row misses
  // the CAS and returns undefined. Sets canceled_at atomically when moving to
  // 'canceled'. Optional fields (grace_until / period) are written when present.
  async updateStatus(
    clinica_id: string,
    fromStatus: SubscriptionStatus,
    toStatus: SubscriptionStatus,
    patch: {
      grace_until?: Date | null;
      current_period_start?: Date | null;
      current_period_end?: Date | null;
      provider?: BillingProviderName | null;
    },
    conn: Knex = db,
  ): Promise<ClinicSubscriptionRow | undefined> {
    const updates: Record<string, unknown> = {
      status: toStatus,
      updated_at: conn.fn.now(),
    };
    if (toStatus === 'canceled') updates.canceled_at = conn.fn.now();
    if (patch.grace_until !== undefined) updates.grace_until = patch.grace_until;
    if (patch.current_period_start !== undefined) {
      updates.current_period_start = patch.current_period_start;
    }
    if (patch.current_period_end !== undefined) {
      updates.current_period_end = patch.current_period_end;
    }
    if (patch.provider !== undefined) updates.provider = patch.provider;

    const [row] = await conn<ClinicSubscriptionRow>('clinic_subscriptions')
      .where({ clinica_id, status: fromStatus })
      .update(updates)
      .returning('*');
    return row;
  },
};
