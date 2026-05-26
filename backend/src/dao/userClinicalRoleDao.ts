import type { Knex } from 'knex';
import { db } from '../config/db';
import type { UserClinicalRoleName, UserClinicalRoleRow } from '../types/db';

// Append-only DAO for `user_clinical_roles` (Sprint 4.2B-2; ADR 0010 §5.4).
//
// `users.papel` is NOT touched here — clinical roles live in their own table so
// the JWT/auth/session path keeps working unchanged. The partial unique index
// `unique_user_clinical_roles_active_partial` enforces at most one ACTIVE grant
// per (user, clinica, role); revocation = setting revoked_at (never DELETE).
//
// Every method is ALWAYS scoped by clinica_id — there is intentionally NO
// "list all clinical roles" method, so a missing tenant filter cannot leak
// cross-clinic role state.
export interface GrantClinicalRoleInput {
  user_id: string;
  clinica_id: string;
  role: UserClinicalRoleName;
  granted_by_user_id: string | null;
}

export const userClinicalRoleDao = {
  // Active (non-revoked) roles for a user within a clinic. Returns just the role
  // names — that is what middleware/services need to decide authorization.
  // ALWAYS tenant-scoped; never crosses clinics.
  async listActiveRoleNames(
    user_id: string,
    clinica_id: string,
    conn: Knex = db,
  ): Promise<UserClinicalRoleName[]> {
    const rows = await conn<UserClinicalRoleRow>('user_clinical_roles')
      .where({ user_id, clinica_id })
      .whereNull('revoked_at')
      .select('role');
    return rows.map((r) => r.role);
  },

  // Full row of an active grant, if any. Used by services that need the id
  // (e.g. revoke) or granted_at (e.g. status output). Tenant-scoped.
  async findActiveForUserRole(
    user_id: string,
    clinica_id: string,
    role: UserClinicalRoleName,
    conn: Knex = db,
  ): Promise<UserClinicalRoleRow | undefined> {
    return conn<UserClinicalRoleRow>('user_clinical_roles')
      .where({ user_id, clinica_id, role })
      .whereNull('revoked_at')
      .first();
  },

  // Active grants in the clinic (any user). For owner-only listing of clinical
  // role holders. Tenant-scoped; never crosses clinics.
  async listActiveByClinic(
    clinica_id: string,
    conn: Knex = db,
  ): Promise<UserClinicalRoleRow[]> {
    return conn<UserClinicalRoleRow>('user_clinical_roles')
      .where({ clinica_id })
      .whereNull('revoked_at')
      .orderBy('granted_at', 'desc');
  },

  // Insert a new active grant. The DB partial unique index rejects a second
  // active grant for the same (user, clinica, role); the service surfaces that
  // as a generic 400 (no enumeration of the existing grant).
  async grant(
    input: GrantClinicalRoleInput,
    conn: Knex = db,
  ): Promise<UserClinicalRoleRow> {
    const [row] = await conn<UserClinicalRoleRow>('user_clinical_roles')
      .insert({
        user_id: input.user_id,
        clinica_id: input.clinica_id,
        role: input.role,
        granted_by_user_id: input.granted_by_user_id,
      })
      .returning('*');
    if (!row) {
      throw new Error('userClinicalRoleDao.grant: insert returned no row');
    }
    return row;
  },

  // Compare-and-set revocation: only flips an ACTIVE grant. Tenant-scoped on
  // clinica_id so an actor of clinic A can never revoke a grant of clinic B
  // even with a guessed id. Returns the revoked row, or undefined when the CAS
  // missed (already revoked, cross-tenant, or non-existent id) so the service
  // can surface a generic 404 without enumeration.
  async revoke(
    id: string,
    clinica_id: string,
    revoked_by_user_id: string | null,
    conn: Knex = db,
  ): Promise<UserClinicalRoleRow | undefined> {
    const [row] = await conn<UserClinicalRoleRow>('user_clinical_roles')
      .where({ id, clinica_id })
      .whereNull('revoked_at')
      .update({
        revoked_at: conn.fn.now(),
        revoked_by_user_id,
      })
      .returning('*');
    return row;
  },
};
