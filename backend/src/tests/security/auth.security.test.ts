// R01 — Secure authentication and JWT sessions.
//
// Guards that requireAuth rejects missing/invalid tokens with a generic 401 and
// that an MFA *challenge* token (no `papel`) can never authenticate a protected
// route. Pure: no database, no HTTP server. Run: `pnpm --filter backend test:security`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireAuth } from '../../middlewares/requireAuth';
import { HttpError } from '../../middlewares/errorHandler';
import { tokenService } from '../../services/tokenService';
import { runMiddleware } from './_helpers';

const VALID_UUID = '11111111-1111-4111-8111-111111111111';

test('requireAuth: no Authorization header → 401 unauthorized', async () => {
  const r = await runMiddleware(requireAuth, { headers: {} });
  assert.ok(r instanceof HttpError);
  assert.equal((r as HttpError).status, 401);
  assert.equal((r as HttpError).code, 'unauthorized');
});

test('requireAuth: non-Bearer scheme → 401', async () => {
  const r = await runMiddleware(requireAuth, { headers: { authorization: 'Basic abc' } });
  assert.ok(r instanceof HttpError);
  assert.equal((r as HttpError).status, 401);
});

test('requireAuth: malformed/invalid token → 401 (no detail leaked)', async () => {
  const r = await runMiddleware(requireAuth, {
    headers: { authorization: 'Bearer not-a-real-jwt' },
  });
  assert.ok(r instanceof HttpError);
  assert.equal((r as HttpError).status, 401);
  assert.equal((r as HttpError).code, 'unauthorized');
});

test('requireAuth: valid session token passes and populates req.auth', async () => {
  const token = tokenService.sign({
    sub: VALID_UUID,
    clinica_id: VALID_UUID,
    papel: 'dono_clinica',
  });
  const req: Record<string, unknown> = { headers: { authorization: `Bearer ${token}` } };
  const r = await runMiddleware(requireAuth, req as never);
  assert.equal(r, 'OK');
  assert.equal((req.auth as { sub: string }).sub, VALID_UUID);
  assert.equal((req.auth as { papel: string }).papel, 'dono_clinica');
});

test('requireAuth: an MFA challenge token (no papel) is rejected on protected routes', async () => {
  // The two-step MFA login issues a short-lived challenge token with typ=
  // mfa_challenge and NO papel — it must never authenticate a real route.
  const challenge = tokenService.signMfaChallenge(VALID_UUID);
  const r = await runMiddleware(requireAuth, {
    headers: { authorization: `Bearer ${challenge}` },
  });
  assert.ok(r instanceof HttpError, 'challenge token must not pass requireAuth');
  assert.equal((r as HttpError).status, 401);
});
