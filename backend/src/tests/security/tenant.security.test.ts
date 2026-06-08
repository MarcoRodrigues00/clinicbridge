// R03 — Multi-tenant isolation by clinic.
//
// DB-free guards over the tenant gate's entry points:
//   - requireClinic refuses a token with no clinic (403 no_clinic_context) and
//     refuses anonymous calls (401) BEFORE any DB hit;
//   - the JWT layer rejects a forged/garbage clinica_id, so a tampered token can
//     never smuggle an arbitrary tenant id into req.auth.
// The full cross-tenant DAO enforcement (clinic A cannot read/edit clinic B,
// generic 404 anti-enumeration) is covered against a real database in
// src/tests/integration/tenant.integration.test.ts. Run: `pnpm --filter backend test:security`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { requireClinic } from '../../middlewares/requireAuth';
import { HttpError } from '../../middlewares/errorHandler';
import { tokenService } from '../../services/tokenService';
import { env } from '../../config/env';
import { runMiddleware } from './_helpers';

const UUID = '33333333-3333-4333-8333-333333333333';

test('requireClinic: token without a clinic → 403 no_clinic_context (no DB hit)', async () => {
  const r = await runMiddleware(requireClinic, {
    auth: { sub: UUID, clinica_id: null, papel: 'admin_sistema' },
  });
  assert.ok(r instanceof HttpError);
  assert.equal((r as HttpError).status, 403);
  assert.equal((r as HttpError).code, 'no_clinic_context');
});

test('requireClinic: missing auth → 401 (never falls through to a tenant query)', async () => {
  const r = await runMiddleware(requireClinic, {});
  assert.ok(r instanceof HttpError);
  assert.equal((r as HttpError).status, 401);
});

test('JWT layer rejects a forged non-UUID clinica_id (anti tenant-spoofing)', () => {
  // Hand-craft a token signed with the real secret but a garbage tenant id.
  const forged = jwt.sign(
    { sub: UUID, clinica_id: 'not-a-uuid; OR 1=1', papel: 'dono_clinica' },
    env.JWT_SECRET,
    { algorithm: 'HS256' },
  );
  assert.throws(() => tokenService.verify(forged), /Invalid token clinic/);
});

test('JWT layer rejects a token with no/invalid papel', () => {
  const noRole = jwt.sign({ sub: UUID, clinica_id: UUID }, env.JWT_SECRET, { algorithm: 'HS256' });
  assert.throws(() => tokenService.verify(noRole), /Invalid token papel/);
});
