import type { Knex } from 'knex';
import { db } from '../config/db';
import type {
  ClinicGovernanceMemberRow,
  ClinicGovernanceRole,
} from '../types/db';

// DAO for `clinic_governance_members` (Sprint 6.1A; ADR 0019).
//
// Every method is ALWAYS scoped by clinica_id — there is intentionally NO
// "list all governance" method, so a missing tenant filter cannot leak
// cross-clinic governance state. No physical delete (revocation is a status
// flip; the revoke flow itself is not implemented this sprint).

// Active governance row joined with the member's minimal identity. Used only by
// the owner/titular listing endpoint — name/email are administrative team data
// (NOT clinical, NOT PII-sensitive in the masked sense) and mirror what the team
// management surfaces already expose to the owner.
export interface ClinicGovernanceMemberWithUser extends ClinicGovernanceMemberRow {
  user_nome: string;
  user_email: string;
}

export interface InsertGovernanceMemberInput {
  clinica_id: string;
  user_id: string;
  governance_role: ClinicGovernanceRole;
  created_by_user_id: string | null;
}

export const clinicGovernanceDao = {
  // Active governance members of a clinic, with minimal user identity. Ordered
  // titular first, then by created_at. ALWAYS tenant-scoped.
  async listActiveByClinic(
    clinica_id: string,
    conn: Knex = db,
  ): Promise<ClinicGovernanceMemberWithUser[]> {
    return conn<ClinicGovernanceMemberRow>('clinic_governance_members as g')
      .join('users as u', 'u.id', 'g.user_id')
      .where('g.clinica_id', clinica_id)
      .where('g.status', 'active')
      .orderByRaw("g.governance_role = 'titular' DESC")
      .orderBy('g.created_at', 'asc')
      .select(
        'g.*',
        'u.nome as user_nome',
        'u.email as user_email',
      ) as unknown as Promise<ClinicGovernanceMemberWithUser[]>;
  },

  // Active governance row for a specific user in a clinic, if any. Tenant-scoped.
  async findActiveMember(
    clinica_id: string,
    user_id: string,
    conn: Knex = db,
  ): Promise<ClinicGovernanceMemberRow | undefined> {
    return conn<ClinicGovernanceMemberRow>('clinic_governance_members')
      .where({ clinica_id, user_id, status: 'active' })
      .first();
  },

  // Whether the user has ANY governance row (active OR revoked) in the clinic.
  // Used to distinguish "never had governance" from "had it revoked" so the
  // legacy dono_clinica→titular fallback never resurrects a revoked member.
  // Tenant-scoped; existence only (no row data leaves the DAO).
  async hasAnyMemberForUserClinic(
    clinica_id: string,
    user_id: string,
    conn: Knex = db,
  ): Promise<boolean> {
    const row = await conn<ClinicGovernanceMemberRow>('clinic_governance_members')
      .where({ clinica_id, user_id })
      .first('id');
    return row !== undefined;
  },

  // The clinic's active titular, if any. Tenant-scoped.
  async findActiveTitular(
    clinica_id: string,
    conn: Knex = db,
  ): Promise<ClinicGovernanceMemberRow | undefined> {
    return conn<ClinicGovernanceMemberRow>('clinic_governance_members')
      .where({ clinica_id, status: 'active', governance_role: 'titular' })
      .first();
  },

  // Insert a new active governance row. The partial unique indexes reject a
  // second active row for the same (clinica, user) and a second active titular;
  // the service surfaces those as generic errors (no enumeration).
  async insertMember(
    input: InsertGovernanceMemberInput,
    conn: Knex = db,
  ): Promise<ClinicGovernanceMemberRow> {
    const [row] = await conn<ClinicGovernanceMemberRow>('clinic_governance_members')
      .insert({
        clinica_id: input.clinica_id,
        user_id: input.user_id,
        governance_role: input.governance_role,
        status: 'active',
        created_by_user_id: input.created_by_user_id,
      })
      .returning('*');
    if (!row) {
      throw new Error('clinicGovernanceDao.insertMember: insert returned no row');
    }
    return row;
  },
};
