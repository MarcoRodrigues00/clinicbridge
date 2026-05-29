// Shared helpers for the minimal DB integration suite (Sprint 6.1E.1).
//
// These run against the LOCAL/DEV Postgres (the same DATABASE_URL the app uses),
// reachable from the host on localhost:5432. They are NOT a substitute for a
// dedicated test database — they are an invariant guard. Strict safety rules:
//   - Only synthetic data with a clear prefix (qa.itest.* / *_ITEST_*).
//   - Every test cleans up exactly the clinics/users it created (by id).
//   - NEVER truncate tables, NEVER `docker compose down -v`, NEVER touch the
//     persistent smoke users or the demo clinic.
//   - audit_logs is append-only: cleanup does NOT delete audit rows. Deleting a
//     clinic/user sets the audit FKs (clinica_id / usuario_id) to NULL by the
//     migration's ON DELETE SET NULL, so the evidence row survives anonymised.
//
// Each test file imports `db` here and MUST call `await db.destroy()` in an
// after() hook so its process exits (node:test isolates files per process).

import { db } from '../../config/db';
import { authService, type AuthContext } from '../../services/authService';
import { userDao } from '../../dao/userDao';
import { patientDao } from '../../dao/patientDao';
import type { SafeUser } from '../../models/user';
import type { PublicClinic } from '../../models/clinic';
import type { UserRow } from '../../models/user';

export { db };

export const ITEST_EMAIL_PREFIX = 'qa.itest.';

// Unique-enough suffix for one test run. Integration tests run in real Node (not
// the workflow sandbox), so Date.now()/Math.random() are available here.
let counter = 0;
export function uniq(label: string): string {
  counter += 1;
  return `${label}_${Date.now().toString(36)}_${counter}_${Math.floor(Math.random() * 1e6)}`;
}

export function itestEmail(label: string): string {
  return `${ITEST_EMAIL_PREFIX}${uniq(label)}@clinicbridge.local`;
}

// Synthetic AuthContext — no real IP/UA/request id.
export function makeCtx(): AuthContext {
  return { ip: null, user_agent: null, request_id: null };
}

// A handle on everything a test created, so cleanup is exact (id-scoped).
export interface CreatedScope {
  clinicIds: Set<string>;
  userIds: Set<string>;
}

export function newScope(): CreatedScope {
  return { clinicIds: new Set(), userIds: new Set() };
}

// Registers a brand-new clinic + owner via the REAL register() path (the code
// under test for GOV-NEW-1). Tracks ids for cleanup.
export async function registerTestClinic(
  scope: CreatedScope,
  label = 'owner',
): Promise<{ user: SafeUser; clinic: PublicClinic; email: string; senha: string }> {
  const email = itestEmail(label);
  const senha = 'SmokeDevOnly!23';
  const result = await authService.register(
    {
      nome: `QA ITEST ${label}`,
      email,
      senha,
      nome_clinica: `GOV ITEST ${uniq('clinic')}`,
      consentimento_lgpd: true,
    },
    makeCtx(),
  );
  scope.userIds.add(result.user.id);
  if (result.user.clinica_id) scope.clinicIds.add(result.user.clinica_id);
  return { user: result.user, clinic: result.clinic, email, senha };
}

// Creates a synthetic secretaria member already linked to `clinicId`. Tracks id.
export async function createTestMember(
  scope: CreatedScope,
  clinicId: string,
  label = 'member',
): Promise<UserRow> {
  const user = await userDao.create({
    nome: `QA ITEST ${label}`,
    email: itestEmail(label),
    senha_hash: 'x-not-a-real-hash',
    papel: 'secretaria',
  });
  await userDao.setClinic(user.id, clinicId);
  scope.userIds.add(user.id);
  return user;
}

// Creates a synthetic patient in the clinic (needed for financial charges).
export async function createTestPatient(clinicId: string, label = 'patient'): Promise<string> {
  const row = await patientDao.create({
    clinica_id: clinicId,
    nome: `QA ITEST ${label}`,
    telefone: null,
    email: null,
    cpf: null,
    data_nascimento: null,
    convenio: null,
    numero_carteirinha: null,
  });
  return row.id;
}

// FK-safe, id-scoped cleanup. Deletes ONLY the rows belonging to the tracked
// clinics/users. Preserves audit_logs (ON DELETE SET NULL anonymises them).
export async function cleanup(scope: CreatedScope): Promise<void> {
  const clinicIds = [...scope.clinicIds];
  const userIds = [...scope.userIds];

  await db.transaction(async (trx) => {
    // Break users → clinic reference first so clinics can be deleted.
    if (userIds.length) await trx('users').whereIn('id', userIds).update({ clinica_id: null });
    if (clinicIds.length) {
      await trx('financial_charges').whereIn('clinica_id', clinicIds).del();
      await trx('clinic_services').whereIn('clinica_id', clinicIds).del();
      await trx('patients').whereIn('clinica_id', clinicIds).del();
      await trx('clinic_governance_members').whereIn('clinica_id', clinicIds).del();
      await trx('clinic_join_requests').whereIn('clinic_id', clinicIds).del();
      await trx('clinics').whereIn('id', clinicIds).del();
    }
    if (userIds.length) await trx('users').whereIn('id', userIds).del();
  });
}
