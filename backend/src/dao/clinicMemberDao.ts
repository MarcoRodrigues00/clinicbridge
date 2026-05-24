import type { Knex } from 'knex';
import { db } from '../config/db';
import type { UserPapel } from '../models/user';

// Owner-facing row used to render the team. Identity (name + email) is shown
// ONLY to the clinic owner via the API; never logged in audit. joined_at falls
// back to users.criado_em for the owner (who entered via /auth/register, not via
// an approved join request); for everyone else it is the approved request's
// decided_at. removed_at is the latest 'revoked' decided_at for ex-members.
export interface ClinicMemberRow {
  user_id: string;
  nome: string;
  email: string;
  papel: UserPapel;
  ativo: boolean;
  // active = currently linked to the clinic (users.clinica_id = $clinic).
  // removed = was a member once (clinic_join_requests.status='revoked') but is
  // no longer linked to this clinic. Active wins if the user later rejoined.
  status: 'active' | 'removed';
  joined_at: Date | null;
  removed_at: Date | null;
}

export const clinicMemberDao = {
  // Active members of the clinic. Joined_at uses the latest approved decided_at
  // (Sprint 3.24 invariant: approval grants the vínculo); falls back to
  // users.criado_em for the owner (entered via /auth/register, no approval row).
  async listActive(clinicId: string, conn: Knex = db): Promise<ClinicMemberRow[]> {
    const rows = await conn('users as u')
      .leftJoin(
        conn('clinic_join_requests')
          .select('user_id')
          .max({ joined_at: 'decided_at' })
          .where({ clinic_id: clinicId, status: 'approved' })
          .groupBy('user_id')
          .as('j'),
        'j.user_id',
        'u.id',
      )
      .where('u.clinica_id', clinicId)
      .select<
        Array<{
          user_id: string;
          nome: string;
          email: string;
          papel: UserPapel;
          ativo: boolean;
          joined_at: Date | null;
          criado_em: Date;
        }>
      >(
        'u.id as user_id',
        'u.nome',
        'u.email',
        'u.papel',
        'u.ativo',
        'j.joined_at',
        'u.criado_em',
      )
      .orderBy('u.criado_em', 'asc');

    return rows.map((r) => ({
      user_id: r.user_id,
      nome: r.nome,
      email: r.email,
      papel: r.papel,
      ativo: r.ativo,
      status: 'active',
      joined_at: r.joined_at ?? r.criado_em,
      removed_at: null,
    }));
  },

  // Former members: users with a 'revoked' row for this clinic AND who are NOT
  // currently linked to this clinic. Latest revoked decided_at is removed_at;
  // joined_at is the most-recent approved decided_at before that (if any).
  async listRemoved(clinicId: string, conn: Knex = db): Promise<ClinicMemberRow[]> {
    const rows = await conn('users as u')
      .innerJoin(
        conn('clinic_join_requests')
          .select('user_id')
          .max({ removed_at: 'decided_at' })
          .where({ clinic_id: clinicId, status: 'revoked' })
          .groupBy('user_id')
          .as('r'),
        'r.user_id',
        'u.id',
      )
      .leftJoin(
        conn('clinic_join_requests')
          .select('user_id')
          .max({ joined_at: 'decided_at' })
          .where({ clinic_id: clinicId, status: 'approved' })
          .groupBy('user_id')
          .as('j'),
        'j.user_id',
        'u.id',
      )
      // Postgres NULL semantics: a plain whereNot('u.clinica_id', clinicId)
      // would exclude rows where clinica_id IS NULL (NULL != value yields NULL,
      // not TRUE). IS DISTINCT FROM treats NULL as a value, so a deactivated
      // user (clinica_id IS NULL) is correctly included here.
      .whereRaw('u.clinica_id IS DISTINCT FROM ?', [clinicId])
      .select<
        Array<{
          user_id: string;
          nome: string;
          email: string;
          papel: UserPapel;
          ativo: boolean;
          joined_at: Date | null;
          removed_at: Date;
        }>
      >(
        'u.id as user_id',
        'u.nome',
        'u.email',
        'u.papel',
        'u.ativo',
        'j.joined_at',
        'r.removed_at',
      )
      .orderBy('r.removed_at', 'desc');

    return rows.map((r) => ({
      user_id: r.user_id,
      nome: r.nome,
      email: r.email,
      papel: r.papel,
      ativo: r.ativo,
      status: 'removed',
      joined_at: r.joined_at,
      removed_at: r.removed_at,
    }));
  },

  // Records the revocation in clinic_join_requests as a historical trail. There
  // is no UPDATE here: we INSERT a new 'revoked' row so the lifecycle is visible
  // (re-joining later creates a fresh 'pending' → 'approved' chain).
  async insertRevoked(
    input: { clinic_id: string; user_id: string; decided_by_user_id: string },
    conn: Knex = db,
  ): Promise<string> {
    const [row] = await conn('clinic_join_requests')
      .insert({
        clinic_id: input.clinic_id,
        user_id: input.user_id,
        requested_role: 'secretaria',
        status: 'revoked',
        decided_by_user_id: input.decided_by_user_id,
        decided_at: conn.fn.now(),
        message: null,
      })
      .returning<{ id: string }[]>('id');
    if (!row) throw new Error('clinicMemberDao.insertRevoked: insert returned no row');
    return row.id;
  },
};
