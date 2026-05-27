import type { Knex } from 'knex';
import { db } from '../config/db';
import type { ServiceInsurancePriceRow } from '../types/db';

// service_insurance_prices DAO — Sprint 4.7B (ADR 0016).
//
// Defense-in-depth invariants:
//   1. EVERY read and write is ALWAYS scoped by `clinica_id`.
//   2. NO physical DELETE — soft-delete via `active = false`.
//   3. `reference_price_cents` is REFERENCE only. The financial service NEVER
//      reads from this table to auto-populate `financial_charges.amount_cents`.
//   4. (clinica, service, provider, COALESCE(plan, sentinel)) is UNIQUE at the
//      DB level — the service pre-checks and surfaces 409 on collision.

export interface CreateServiceInsurancePriceInput {
  clinica_id: string;
  service_id: string;
  provider_id: string;
  plan_id: string | null;
  reference_price_cents: number | null;
  notes: string | null;
}

export interface UpdateServiceInsurancePriceFields {
  reference_price_cents?: number | null;
  notes?: string | null;
}

export interface ListServiceInsurancePricesFilters {
  service_id?: string | null;
  provider_id?: string | null;
  plan_id?: string | null;
  active?: boolean | null;
  limit: number;
  offset: number;
}

// Sentinel used by the unique index COALESCE trick — NEVER a real plan id.
const NULL_PLAN_SENTINEL = '00000000-0000-0000-0000-000000000000';

export const serviceInsurancePriceDao = {
  async create(
    input: CreateServiceInsurancePriceInput,
    conn: Knex = db,
  ): Promise<ServiceInsurancePriceRow> {
    const [row] = await conn<ServiceInsurancePriceRow>('service_insurance_prices')
      .insert({
        clinica_id: input.clinica_id,
        service_id: input.service_id,
        provider_id: input.provider_id,
        plan_id: input.plan_id,
        reference_price_cents: input.reference_price_cents,
        notes: input.notes,
      })
      .returning('*');
    if (!row) throw new Error('serviceInsurancePriceDao.create: insert returned no row');
    return row;
  },

  async listForClinic(
    clinica_id: string,
    filters: ListServiceInsurancePricesFilters,
    conn: Knex = db,
  ): Promise<ServiceInsurancePriceRow[]> {
    const query = conn<ServiceInsurancePriceRow>('service_insurance_prices').where({
      clinica_id,
    });
    if (filters.service_id) query.andWhere({ service_id: filters.service_id });
    if (filters.provider_id) query.andWhere({ provider_id: filters.provider_id });
    if (filters.plan_id) query.andWhere({ plan_id: filters.plan_id });
    if (filters.active === true || filters.active === false) {
      query.andWhere({ active: filters.active });
    }
    return query
      .orderBy('created_at', 'desc')
      .limit(filters.limit)
      .offset(filters.offset);
  },

  async findByIdForClinic(
    id: string,
    clinica_id: string,
    conn: Knex = db,
  ): Promise<ServiceInsurancePriceRow | undefined> {
    return conn<ServiceInsurancePriceRow>('service_insurance_prices')
      .where({ id, clinica_id })
      .first();
  },

  // Pre-check duplicate (clinic, service, provider, plan) — mirrors the DB
  // UNIQUE INDEX. Used by the service to return 409 before INSERT; the index
  // is the real guard on race.
  async findByTupleForClinic(
    clinica_id: string,
    service_id: string,
    provider_id: string,
    plan_id: string | null,
    conn: Knex = db,
  ): Promise<ServiceInsurancePriceRow | undefined> {
    return conn<ServiceInsurancePriceRow>('service_insurance_prices')
      .whereRaw(
        `clinica_id = ? AND service_id = ? AND provider_id = ?
         AND COALESCE(plan_id, ?::uuid) = COALESCE(?::uuid, ?::uuid)`,
        [clinica_id, service_id, provider_id, NULL_PLAN_SENTINEL, plan_id, NULL_PLAN_SENTINEL],
      )
      .first();
  },

  async updateForClinic(
    id: string,
    clinica_id: string,
    fields: UpdateServiceInsurancePriceFields,
    conn: Knex = db,
  ): Promise<ServiceInsurancePriceRow | undefined> {
    const patch: Record<string, unknown> = { updated_at: conn.fn.now() };
    if (fields.reference_price_cents !== undefined) {
      patch.reference_price_cents = fields.reference_price_cents;
    }
    if (fields.notes !== undefined) patch.notes = fields.notes;

    const [row] = await conn<ServiceInsurancePriceRow>('service_insurance_prices')
      .where({ id, clinica_id })
      .update(patch)
      .returning('*');
    return row;
  },

  async updateStatus(
    id: string,
    clinica_id: string,
    active: boolean,
    conn: Knex = db,
  ): Promise<ServiceInsurancePriceRow | undefined> {
    const [row] = await conn<ServiceInsurancePriceRow>('service_insurance_prices')
      .where({ id, clinica_id })
      .update({ active, updated_at: conn.fn.now() })
      .returning('*');
    return row;
  },
};
