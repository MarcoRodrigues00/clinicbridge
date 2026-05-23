import type { Knex } from 'knex';
import { db } from '../config/db';
import type { ClinicProfessionalRow } from '../types/db';

export interface CreateClinicProfessionalInput {
  clinica_id: string;
  name: string;
  specialty_label: string | null;
}

export interface UpdateClinicProfessionalFields {
  name?: string;
  specialty_label?: string | null;
  is_active?: boolean;
}

// clinic_professionals DAO. Every read/write is ALWAYS scoped by clinica_id —
// there is intentionally no listAll(), and no physical delete (deactivate sets
// is_active=false). Administrative data only; no clinical fields exist.
export const clinicProfessionalDao = {
  async create(
    input: CreateClinicProfessionalInput,
    conn: Knex = db,
  ): Promise<ClinicProfessionalRow> {
    const [row] = await conn<ClinicProfessionalRow>('clinic_professionals')
      .insert({
        clinica_id: input.clinica_id,
        name: input.name,
        specialty_label: input.specialty_label,
      })
      .returning('*');
    if (!row) throw new Error('clinicProfessionalDao.create: insert returned no row');
    return row;
  },

  async listByClinic(
    clinica_id: string,
    options: { active?: boolean | null } = {},
    conn: Knex = db,
  ): Promise<ClinicProfessionalRow[]> {
    const query = conn<ClinicProfessionalRow>('clinic_professionals').where({ clinica_id });
    if (options.active === true || options.active === false) {
      query.andWhere({ is_active: options.active });
    }
    return query.orderBy('name', 'asc');
  },

  async findByIdForClinic(
    id: string,
    clinica_id: string,
    conn: Knex = db,
  ): Promise<ClinicProfessionalRow | undefined> {
    return conn<ClinicProfessionalRow>('clinic_professionals').where({ id, clinica_id }).first();
  },

  // Tenant-scoped update. Touches updated_at. Returns the updated row, or
  // undefined when the id doesn't belong to the clinic (no cross-tenant write).
  async updateForClinic(
    id: string,
    clinica_id: string,
    fields: UpdateClinicProfessionalFields,
    conn: Knex = db,
  ): Promise<ClinicProfessionalRow | undefined> {
    const patch: Record<string, unknown> = { updated_at: conn.fn.now() };
    if (fields.name !== undefined) patch.name = fields.name;
    if (fields.specialty_label !== undefined) patch.specialty_label = fields.specialty_label;
    if (fields.is_active !== undefined) patch.is_active = fields.is_active;

    const [row] = await conn<ClinicProfessionalRow>('clinic_professionals')
      .where({ id, clinica_id })
      .update(patch)
      .returning('*');
    return row;
  },
};
