import type { Knex } from 'knex';
import { db } from '../config/db';
import type { InsuranceProviderRow } from '../types/db';

// insurance_providers DAO — Sprint 4.7B (ADR 0016).
//
// Defense-in-depth invariants enforced HERE:
//   1. EVERY read and write is ALWAYS scoped by `clinica_id`. There is no
//      `listAll()`; there is no `findById()` without a clinic.
//   2. NO physical DELETE at the app layer. Operadoras are soft-deleted via
//      `active = false` so historical patient_insurances / service_insurance_prices
//      / financial_charges retain meaning.
//   3. The DAO never JOINs against any clinical_* table.

export interface CreateInsuranceProviderInput {
  clinica_id: string;
  name: string;
  notes: string | null;
}

export interface UpdateInsuranceProviderFields {
  name?: string;
  notes?: string | null;
}

export interface ListInsuranceProvidersFilters {
  active?: boolean | null;
  limit: number;
  offset: number;
}

export const insuranceProviderDao = {
  async create(
    input: CreateInsuranceProviderInput,
    conn: Knex = db,
  ): Promise<InsuranceProviderRow> {
    const [row] = await conn<InsuranceProviderRow>('insurance_providers')
      .insert({
        clinica_id: input.clinica_id,
        name: input.name,
        notes: input.notes,
      })
      .returning('*');
    if (!row) throw new Error('insuranceProviderDao.create: insert returned no row');
    return row;
  },

  async listForClinic(
    clinica_id: string,
    filters: ListInsuranceProvidersFilters,
    conn: Knex = db,
  ): Promise<InsuranceProviderRow[]> {
    const query = conn<InsuranceProviderRow>('insurance_providers').where({ clinica_id });
    if (filters.active === true || filters.active === false) {
      query.andWhere({ active: filters.active });
    }
    return query.orderBy('name', 'asc').limit(filters.limit).offset(filters.offset);
  },

  async findByIdForClinic(
    id: string,
    clinica_id: string,
    conn: Knex = db,
  ): Promise<InsuranceProviderRow | undefined> {
    return conn<InsuranceProviderRow>('insurance_providers')
      .where({ id, clinica_id })
      .first();
  },

  // Tenant-scoped lookup by (clinica_id, name) — used to pre-check duplicates
  // before INSERT. The DB UNIQUE INDEX on lower(btrim(name)) is the real guard
  // against races; the service surfaces a clean 409 either way.
  async findByNameForClinic(
    clinica_id: string,
    name: string,
    conn: Knex = db,
  ): Promise<InsuranceProviderRow | undefined> {
    return conn<InsuranceProviderRow>('insurance_providers')
      .whereRaw('clinica_id = ? AND lower(btrim(name)) = lower(btrim(?))', [clinica_id, name])
      .first();
  },

  async updateForClinic(
    id: string,
    clinica_id: string,
    fields: UpdateInsuranceProviderFields,
    conn: Knex = db,
  ): Promise<InsuranceProviderRow | undefined> {
    const patch: Record<string, unknown> = { updated_at: conn.fn.now() };
    if (fields.name !== undefined) patch.name = fields.name;
    if (fields.notes !== undefined) patch.notes = fields.notes;

    const [row] = await conn<InsuranceProviderRow>('insurance_providers')
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
  ): Promise<InsuranceProviderRow | undefined> {
    const [row] = await conn<InsuranceProviderRow>('insurance_providers')
      .where({ id, clinica_id })
      .update({ active, updated_at: conn.fn.now() })
      .returning('*');
    return row;
  },
};
