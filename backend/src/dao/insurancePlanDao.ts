import type { Knex } from 'knex';
import { db } from '../config/db';
import type { InsurancePlanRow } from '../types/db';

// insurance_plans DAO — Sprint 4.7B (ADR 0016).
//
// Defense-in-depth invariants:
//   1. EVERY read and write is ALWAYS scoped by `clinica_id`.
//   2. NO physical DELETE — soft-delete via `active = false`.
//   3. Plans live under a provider. The service is responsible for verifying
//      that the provider_id belongs to the same clinic before touching this DAO.

export interface CreateInsurancePlanInput {
  clinica_id: string;
  provider_id: string;
  name: string;
  notes: string | null;
}

export interface UpdateInsurancePlanFields {
  name?: string;
  notes?: string | null;
}

export interface ListInsurancePlansFilters {
  provider_id?: string | null;
  active?: boolean | null;
  limit: number;
  offset: number;
}

export const insurancePlanDao = {
  async create(
    input: CreateInsurancePlanInput,
    conn: Knex = db,
  ): Promise<InsurancePlanRow> {
    const [row] = await conn<InsurancePlanRow>('insurance_plans')
      .insert({
        clinica_id: input.clinica_id,
        provider_id: input.provider_id,
        name: input.name,
        notes: input.notes,
      })
      .returning('*');
    if (!row) throw new Error('insurancePlanDao.create: insert returned no row');
    return row;
  },

  async listForClinic(
    clinica_id: string,
    filters: ListInsurancePlansFilters,
    conn: Knex = db,
  ): Promise<InsurancePlanRow[]> {
    const query = conn<InsurancePlanRow>('insurance_plans').where({ clinica_id });
    if (filters.provider_id) query.andWhere({ provider_id: filters.provider_id });
    if (filters.active === true || filters.active === false) {
      query.andWhere({ active: filters.active });
    }
    return query.orderBy('name', 'asc').limit(filters.limit).offset(filters.offset);
  },

  async findByIdForClinic(
    id: string,
    clinica_id: string,
    conn: Knex = db,
  ): Promise<InsurancePlanRow | undefined> {
    return conn<InsurancePlanRow>('insurance_plans').where({ id, clinica_id }).first();
  },

  // Pre-check duplicate name within (clinic, provider). The DB UNIQUE INDEX is
  // the real guard against races.
  async findByNameForProvider(
    clinica_id: string,
    provider_id: string,
    name: string,
    conn: Knex = db,
  ): Promise<InsurancePlanRow | undefined> {
    return conn<InsurancePlanRow>('insurance_plans')
      .whereRaw(
        'clinica_id = ? AND provider_id = ? AND lower(btrim(name)) = lower(btrim(?))',
        [clinica_id, provider_id, name],
      )
      .first();
  },

  async updateForClinic(
    id: string,
    clinica_id: string,
    fields: UpdateInsurancePlanFields,
    conn: Knex = db,
  ): Promise<InsurancePlanRow | undefined> {
    const patch: Record<string, unknown> = { updated_at: conn.fn.now() };
    if (fields.name !== undefined) patch.name = fields.name;
    if (fields.notes !== undefined) patch.notes = fields.notes;

    const [row] = await conn<InsurancePlanRow>('insurance_plans')
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
  ): Promise<InsurancePlanRow | undefined> {
    const [row] = await conn<InsurancePlanRow>('insurance_plans')
      .where({ id, clinica_id })
      .update({ active, updated_at: conn.fn.now() })
      .returning('*');
    return row;
  },
};
