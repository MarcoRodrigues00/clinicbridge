import type { Knex } from 'knex';
import { db } from '../config/db';
import type { ClinicServiceRow, ProfessionalServiceRow } from '../types/db';

// clinic_services DAO + professional_services binding DAO (Sprint 4.6B, ADR 0015).
//
// Defense-in-depth invariants enforced HERE:
//   1. EVERY read and write is ALWAYS scoped by `clinica_id`. There is no
//      `listAll()`; there is no `findById()` without a clinic — cross-tenant
//      access is unreachable from this DAO.
//   2. NO physical DELETE in either table at the app layer. Catalog rows are
//      historical (referenced by appointments / financial_charges via SET NULL
//      FK). Bindings use the `active` flag.
//   3. The DAO never JOINs against any clinical_* table.

export interface CreateClinicServiceInput {
  clinica_id: string;
  name: string;
  category: string | null;
  description: string | null;
  duration_minutes: number | null;
  price_cents: number | null;
}

export interface UpdateClinicServiceFields {
  name?: string;
  category?: string | null;
  description?: string | null;
  duration_minutes?: number | null;
  price_cents?: number | null;
}

export interface ListClinicServicesFilters {
  active?: boolean | null;
  professional_id?: string | null;
  limit: number;
  offset: number;
}

export const clinicServiceDao = {
  async create(
    input: CreateClinicServiceInput,
    conn: Knex = db,
  ): Promise<ClinicServiceRow> {
    const [row] = await conn<ClinicServiceRow>('clinic_services')
      .insert({
        clinica_id: input.clinica_id,
        name: input.name,
        category: input.category,
        description: input.description,
        duration_minutes: input.duration_minutes,
        price_cents: input.price_cents,
      })
      .returning('*');
    if (!row) throw new Error('clinicServiceDao.create: insert returned no row');
    return row;
  },

  async listForClinic(
    clinica_id: string,
    filters: ListClinicServicesFilters,
    conn: Knex = db,
  ): Promise<ClinicServiceRow[]> {
    const query = conn<ClinicServiceRow>('clinic_services').where({ clinica_id });
    if (filters.active === true || filters.active === false) {
      query.andWhere({ active: filters.active });
    }
    if (filters.professional_id) {
      query.whereExists(
        conn.select(conn.raw('1'))
          .from('professional_services')
          .where('professional_services.clinica_id', clinica_id)
          .andWhere('professional_services.professional_id', filters.professional_id)
          .andWhereRaw('professional_services.service_id = clinic_services.id')
          .andWhere('professional_services.active', true),
      );
    }
    return query.orderBy('name', 'asc').limit(filters.limit).offset(filters.offset);
  },

  async findByIdForClinic(
    id: string,
    clinica_id: string,
    conn: Knex = db,
  ): Promise<ClinicServiceRow | undefined> {
    return conn<ClinicServiceRow>('clinic_services').where({ id, clinica_id }).first();
  },

  // Tenant-scoped lookup by (clinica_id, name). Used to disambiguate a 23505
  // unique violation between "stale row" (same name re-typed) and a real
  // duplicate — the service surfaces a clean 409 either way.
  async findByNameForClinic(
    clinica_id: string,
    name: string,
    conn: Knex = db,
  ): Promise<ClinicServiceRow | undefined> {
    return conn<ClinicServiceRow>('clinic_services')
      .where({ clinica_id, name })
      .first();
  },

  // Tenant-scoped update. Touches updated_at. Returns undefined when the id
  // doesn't belong to the clinic (the service surfaces a generic 404). Does NOT
  // touch `active` — status toggles use updateStatus.
  async updateForClinic(
    id: string,
    clinica_id: string,
    fields: UpdateClinicServiceFields,
    conn: Knex = db,
  ): Promise<ClinicServiceRow | undefined> {
    const patch: Record<string, unknown> = { updated_at: conn.fn.now() };
    if (fields.name !== undefined) patch.name = fields.name;
    if (fields.category !== undefined) patch.category = fields.category;
    if (fields.description !== undefined) patch.description = fields.description;
    if (fields.duration_minutes !== undefined) {
      patch.duration_minutes = fields.duration_minutes;
    }
    if (fields.price_cents !== undefined) patch.price_cents = fields.price_cents;

    const [row] = await conn<ClinicServiceRow>('clinic_services')
      .where({ id, clinica_id })
      .update(patch)
      .returning('*');
    return row;
  },

  // Tenant-scoped status toggle. Soft-delete only — `active=false` keeps the
  // row referenceable by historical appointments / financial_charges.
  async updateStatus(
    id: string,
    clinica_id: string,
    active: boolean,
    conn: Knex = db,
  ): Promise<ClinicServiceRow | undefined> {
    const [row] = await conn<ClinicServiceRow>('clinic_services')
      .where({ id, clinica_id })
      .update({ active, updated_at: conn.fn.now() })
      .returning('*');
    return row;
  },
};

// professional_services binding DAO. The composite PK is (professional_id,
// service_id); re-binding the same pair flips `active` back to true via the
// service (no duplicate INSERT — caught by service before reaching DAO).
export const professionalServiceDao = {
  async findBinding(
    clinica_id: string,
    professional_id: string,
    service_id: string,
    conn: Knex = db,
  ): Promise<ProfessionalServiceRow | undefined> {
    return conn<ProfessionalServiceRow>('professional_services')
      .where({ clinica_id, professional_id, service_id })
      .first();
  },

  async listByService(
    clinica_id: string,
    service_id: string,
    options: { active?: boolean | null } = {},
    conn: Knex = db,
  ): Promise<ProfessionalServiceRow[]> {
    const query = conn<ProfessionalServiceRow>('professional_services').where({
      clinica_id,
      service_id,
    });
    if (options.active === true || options.active === false) {
      query.andWhere({ active: options.active });
    }
    return query.orderBy('created_at', 'asc');
  },

  async create(
    input: { clinica_id: string; professional_id: string; service_id: string },
    conn: Knex = db,
  ): Promise<ProfessionalServiceRow> {
    const [row] = await conn<ProfessionalServiceRow>('professional_services')
      .insert({
        clinica_id: input.clinica_id,
        professional_id: input.professional_id,
        service_id: input.service_id,
        active: true,
      })
      .returning('*');
    if (!row) throw new Error('professionalServiceDao.create: insert returned no row');
    return row;
  },

  async updateStatus(
    clinica_id: string,
    professional_id: string,
    service_id: string,
    active: boolean,
    conn: Knex = db,
  ): Promise<ProfessionalServiceRow | undefined> {
    const [row] = await conn<ProfessionalServiceRow>('professional_services')
      .where({ clinica_id, professional_id, service_id })
      .update({ active, updated_at: conn.fn.now() })
      .returning('*');
    return row;
  },
};
