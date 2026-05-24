import type { Knex } from 'knex';
import { db } from '../config/db';
import type { ClinicJoinRequestRow } from '../models/clinicJoinRequest';

export interface CreateJoinRequestInput {
  clinic_id: string;
  user_id: string;
  message: string | null;
}

// Requester-facing row joined with the clinic name (the user already holds the
// code for that clinic, so showing its name back is not enumeration).
export interface MyJoinRequestRow extends ClinicJoinRequestRow {
  clinic_name: string;
}

// Owner-facing pending row joined with the applicant's identity. Shown ONLY to
// the clinic owner so they can recognize who is asking to join — never logged.
export interface PendingJoinRequestRow {
  id: string;
  requested_role: string;
  message: string | null;
  created_at: Date;
  applicant_name: string;
  applicant_email: string;
}

// clinic_join_requests DAO (Sprint 3.24). Owner reads are ALWAYS scoped by
// clinic_id; requester reads are ALWAYS scoped by user_id — so neither side can
// see another tenant's/person's requests.
export const clinicJoinRequestDao = {
  async create(input: CreateJoinRequestInput, conn: Knex = db): Promise<ClinicJoinRequestRow> {
    const [row] = await conn<ClinicJoinRequestRow>('clinic_join_requests')
      .insert({
        clinic_id: input.clinic_id,
        user_id: input.user_id,
        requested_role: 'secretaria',
        status: 'pending',
        message: input.message,
      })
      .returning('*');
    if (!row) throw new Error('clinicJoinRequestDao.create: insert returned no row');
    return row;
  },

  async findPending(
    userId: string,
    clinicId: string,
    conn: Knex = db,
  ): Promise<ClinicJoinRequestRow | undefined> {
    return conn<ClinicJoinRequestRow>('clinic_join_requests')
      .where({ user_id: userId, clinic_id: clinicId, status: 'pending' })
      .first();
  },

  // Requester-scoped fetch (only the owner of the request).
  async findByIdForUser(
    id: string,
    userId: string,
    conn: Knex = db,
  ): Promise<ClinicJoinRequestRow | undefined> {
    return conn<ClinicJoinRequestRow>('clinic_join_requests')
      .where({ id, user_id: userId })
      .first();
  },

  // Owner-scoped fetch (request must belong to the owner's clinic).
  async findByIdForClinic(
    id: string,
    clinicId: string,
    conn: Knex = db,
  ): Promise<ClinicJoinRequestRow | undefined> {
    return conn<ClinicJoinRequestRow>('clinic_join_requests')
      .where({ id, clinic_id: clinicId })
      .first();
  },

  async listByUser(userId: string, conn: Knex = db): Promise<MyJoinRequestRow[]> {
    return conn<ClinicJoinRequestRow>('clinic_join_requests as r')
      .leftJoin('clinics as c', 'c.id', 'r.clinic_id')
      .where('r.user_id', userId)
      .orderBy('r.created_at', 'desc')
      .select('r.*', 'c.nome as clinic_name') as unknown as Promise<MyJoinRequestRow[]>;
  },

  async listPendingForClinic(
    clinicId: string,
    conn: Knex = db,
  ): Promise<PendingJoinRequestRow[]> {
    return conn('clinic_join_requests as r')
      .join('users as u', 'u.id', 'r.user_id')
      .where({ 'r.clinic_id': clinicId, 'r.status': 'pending' })
      .orderBy('r.created_at', 'asc')
      .select(
        'r.id',
        'r.requested_role',
        'r.message',
        'r.created_at',
        'u.nome as applicant_name',
        'u.email as applicant_email',
      ) as unknown as Promise<PendingJoinRequestRow[]>;
  },

  // Sets a final status (cancelled by requester, or approved/rejected by owner).
  async setStatus(
    id: string,
    status: 'approved' | 'rejected' | 'cancelled',
    decidedByUserId: string | null,
    conn: Knex = db,
  ): Promise<ClinicJoinRequestRow | undefined> {
    const [row] = await conn<ClinicJoinRequestRow>('clinic_join_requests')
      .where({ id })
      .update({
        status,
        decided_by_user_id: decidedByUserId,
        decided_at: conn.fn.now(),
        updated_at: conn.fn.now(),
      })
      .returning('*');
    return row;
  },

  // After a user is approved into a clinic, cancel their OTHER pending requests
  // (they can only belong to one clinic). Returns the number cancelled.
  async cancelOtherPending(
    userId: string,
    exceptId: string,
    conn: Knex = db,
  ): Promise<number> {
    return conn<ClinicJoinRequestRow>('clinic_join_requests')
      .where({ user_id: userId, status: 'pending' })
      .andWhereNot({ id: exceptId })
      .update({ status: 'cancelled', updated_at: conn.fn.now() });
  },
};
