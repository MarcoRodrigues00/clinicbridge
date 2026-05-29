// Unit tests for the governance authorization gate (ADR 0019).
//
// These guard the security-critical invariants of requireClinicGovernance with
// NO database: the DAO methods are mocked on the imported object via node:test's
// mock.method (the middleware reads clinicGovernanceDao.<fn> at call time, so the
// replacement applies). Run: `pnpm --filter backend test`.
//
// The crown-jewel invariant covered here is: the dono_clinica→titular legacy
// fallback must fire ONLY when the user NEVER had a governance row, and must
// NEVER resurrect a member whose row was revoked.

import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import { requireClinicGovernance } from './requireClinicGovernance';
import { clinicGovernanceDao } from '../dao/clinicGovernanceDao';
import { HttpError } from './errorHandler';
import type { ClinicGovernanceMemberRow, ClinicGovernanceRole } from '../types/db';

const CLINIC = '00000000-0000-0000-0000-0000000000c1';
const USER = '00000000-0000-0000-0000-0000000000a1';

function activeRow(role: ClinicGovernanceRole): ClinicGovernanceMemberRow {
  return {
    id: 'row-1',
    clinica_id: CLINIC,
    user_id: USER,
    governance_role: role,
    status: 'active',
    created_at: new Date(),
    created_by_user_id: null,
    revoked_at: null,
    revoked_by_user_id: null,
    revoke_reason: null,
  } as ClinicGovernanceMemberRow;
}

interface DaoMocks {
  findActiveMember?: ClinicGovernanceMemberRow | undefined;
  hasAnyMember?: boolean;
}

// Runs the gate and returns either 'OK' (next() with no error) or the HttpError
// passed to next(err).
async function run(
  allowed: readonly ClinicGovernanceRole[],
  auth: { sub: string; clinica_id: string | null; papel: string },
  dao: DaoMocks,
): Promise<'OK' | unknown> {
  mock.method(clinicGovernanceDao, 'findActiveMember', async () => dao.findActiveMember);
  mock.method(clinicGovernanceDao, 'hasAnyMemberForUserClinic', async () => dao.hasAnyMember ?? false);

  let outcome: 'OK' | unknown = 'NOT_CALLED';
  const next: NextFunction = (err?: unknown) => {
    outcome = err === undefined ? 'OK' : err;
  };
  const req = { auth } as unknown as Request;
  await requireClinicGovernance(allowed)(req, {} as Response, next);
  return outcome;
}

afterEach(() => mock.restoreAll());

const ownerAuth = { sub: USER, clinica_id: CLINIC, papel: 'dono_clinica' };
const secAuth = { sub: USER, clinica_id: CLINIC, papel: 'secretaria' };

test('active titular is allowed when titular is in the allowlist', async () => {
  const r = await run(['titular', 'administrador'], ownerAuth, { findActiveMember: activeRow('titular') });
  assert.equal(r, 'OK');
});

test('active administrador is allowed when administrador is in the allowlist', async () => {
  const r = await run(['titular', 'administrador'], secAuth, { findActiveMember: activeRow('administrador') });
  assert.equal(r, 'OK');
});

test('active administrador is FORBIDDEN when only titular is allowed (no fallback for active members)', async () => {
  const r = await run(['titular'], secAuth, { findActiveMember: activeRow('administrador') });
  assert.ok(r instanceof HttpError);
  assert.equal((r as HttpError).status, 403);
  assert.equal((r as HttpError).code, 'forbidden_governance');
});

test('REVOKED row does NOT activate the dono_clinica fallback (no resurrection)', async () => {
  // No active row, but a row existed (revoked) → hasAnyMember=true → 403, even for dono_clinica.
  const r = await run(['titular'], ownerAuth, { findActiveMember: undefined, hasAnyMember: true });
  assert.ok(r instanceof HttpError);
  assert.equal((r as HttpError).status, 403);
  assert.equal((r as HttpError).code, 'forbidden_governance');
});

test('dono_clinica with NO governance row at all passes via the legacy fallback', async () => {
  const r = await run(['titular'], ownerAuth, { findActiveMember: undefined, hasAnyMember: false });
  assert.equal(r, 'OK');
});

test('secretaria without any governance row is FORBIDDEN (no fallback for non-owners)', async () => {
  const r = await run(['titular', 'administrador'], secAuth, { findActiveMember: undefined, hasAnyMember: false });
  assert.ok(r instanceof HttpError);
  assert.equal((r as HttpError).status, 403);
  assert.equal((r as HttpError).code, 'forbidden_governance');
});

test('missing clinica_id yields 403 no_clinic_context (defense in depth)', async () => {
  const r = await run(['titular'], { sub: USER, clinica_id: null, papel: 'admin_sistema' }, {});
  assert.ok(r instanceof HttpError);
  assert.equal((r as HttpError).status, 403);
  assert.equal((r as HttpError).code, 'no_clinic_context');
});
