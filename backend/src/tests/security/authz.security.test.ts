// R02 — Authorization by role, clinical grants and governance.
//
// Guards requireRole: a non-allowed role gets a generic 403 forbidden_role; the
// allowed role passes; a request with no auth gets 401. The governance gate
// (requireClinicGovernance: revoked-member / dono_clinica-fallback invariants) is
// covered by src/middlewares/requireClinicGovernance.test.ts — both feed R02.
// Pure: no database. Run: `pnpm --filter backend test:security`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireRole, CLINIC_ADMIN_ROLES } from '../../middlewares/requireAuth';
import { HttpError } from '../../middlewares/errorHandler';
import { runMiddleware } from './_helpers';
import type { AuthClaims } from '../../services/tokenService';

const UUID = '22222222-2222-4222-8222-222222222222';

function authAs(papel: AuthClaims['papel']): AuthClaims {
  return { sub: UUID, clinica_id: UUID, papel };
}

test('requireRole(dono_clinica): secretaria is forbidden with generic 403', async () => {
  const r = await runMiddleware(requireRole(CLINIC_ADMIN_ROLES), { auth: authAs('secretaria') });
  assert.ok(r instanceof HttpError);
  assert.equal((r as HttpError).status, 403);
  assert.equal((r as HttpError).code, 'forbidden_role');
});

test('requireRole(dono_clinica): admin_sistema is forbidden too', async () => {
  const r = await runMiddleware(requireRole(CLINIC_ADMIN_ROLES), { auth: authAs('admin_sistema') });
  assert.ok(r instanceof HttpError);
  assert.equal((r as HttpError).status, 403);
});

test('requireRole(dono_clinica): the owner passes', async () => {
  const r = await runMiddleware(requireRole(CLINIC_ADMIN_ROLES), { auth: authAs('dono_clinica') });
  assert.equal(r, 'OK');
});

test('requireRole: no auth context → 401 (never silently allows)', async () => {
  const r = await runMiddleware(requireRole(CLINIC_ADMIN_ROLES), {});
  assert.ok(r instanceof HttpError);
  assert.equal((r as HttpError).status, 401);
});
