import type { Knex } from 'knex';
import { db } from '../config/db';
import type { AppointmentRow } from '../types/db';

export interface CreateAppointmentInput {
  clinica_id: string;
  patient_id: string;
  professional_id: string | null;
  starts_at: Date;
  ends_at: Date;
  status: string;
  administrative_notes: string | null;
  created_by_user_id: string | null;
}

export interface ListAppointmentsFilters {
  // Already validated by the service. Half-open window [from, to).
  from?: Date | null;
  to?: Date | null;
  professional_id?: string | null;
  status?: string | null;
  limit: number;
}

// appointments DAO. Every read/write is ALWAYS scoped by clinica_id — there is
// intentionally no listAll(), and no physical delete (cancellation is a status).
// Administrative data only.
export const appointmentDao = {
  async create(input: CreateAppointmentInput, conn: Knex = db): Promise<AppointmentRow> {
    const [row] = await conn<AppointmentRow>('appointments')
      .insert({
        clinica_id: input.clinica_id,
        patient_id: input.patient_id,
        professional_id: input.professional_id,
        starts_at: input.starts_at,
        ends_at: input.ends_at,
        status: input.status,
        administrative_notes: input.administrative_notes,
        created_by_user_id: input.created_by_user_id,
      })
      .returning('*');
    if (!row) throw new Error('appointmentDao.create: insert returned no row');
    return row;
  },

  async listByClinic(
    clinica_id: string,
    filters: ListAppointmentsFilters,
    conn: Knex = db,
  ): Promise<AppointmentRow[]> {
    const query = conn<AppointmentRow>('appointments').where({ clinica_id });
    if (filters.from) query.andWhere('starts_at', '>=', filters.from);
    if (filters.to) query.andWhere('starts_at', '<', filters.to);
    if (filters.professional_id) query.andWhere({ professional_id: filters.professional_id });
    if (filters.status) query.andWhere({ status: filters.status });
    return query.orderBy('starts_at', 'asc').limit(filters.limit);
  },

  async findByIdForClinic(
    id: string,
    clinica_id: string,
    conn: Knex = db,
  ): Promise<AppointmentRow | undefined> {
    return conn<AppointmentRow>('appointments').where({ id, clinica_id }).first();
  },

  // Tenant-scoped status change. Records who changed it; touches updated_at.
  async updateStatusForClinic(
    id: string,
    clinica_id: string,
    status: string,
    updated_by_user_id: string | null,
    conn: Knex = db,
  ): Promise<AppointmentRow | undefined> {
    const [row] = await conn<AppointmentRow>('appointments')
      .where({ id, clinica_id })
      .update({ status, updated_by_user_id, updated_at: conn.fn.now() })
      .returning('*');
    return row;
  },

  // Tenant-scoped reschedule: updates the time window and marks status
  // 'rescheduled'. No physical delete.
  async rescheduleForClinic(
    id: string,
    clinica_id: string,
    starts_at: Date,
    ends_at: Date,
    updated_by_user_id: string | null,
    conn: Knex = db,
  ): Promise<AppointmentRow | undefined> {
    const [row] = await conn<AppointmentRow>('appointments')
      .where({ id, clinica_id })
      .update({
        starts_at,
        ends_at,
        status: 'rescheduled',
        updated_by_user_id,
        updated_at: conn.fn.now(),
      })
      .returning('*');
    return row;
  },
};
