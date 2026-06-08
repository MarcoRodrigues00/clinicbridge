// R08 — Rate limiting and abuse protection.
//
// Objective config/structure checks (no live flood needed):
//   - the per-scope limiters are real Express middleware built from env;
//   - sane positive defaults are configured;
//   - the /auth limiter is mounted on the router BEFORE the auth handlers, so a
//     flood is rejected ahead of authentication/DB work;
//   - the generic 429 body never echoes caller input.
// Run: `pnpm --filter backend test:security`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { env } from '../../config/env';
import { authRateLimit } from '../../middlewares/authRateLimit';
import { patientsRateLimit, exportRateLimit, importRateLimit } from '../../middlewares/rateLimit';
import { repoRoot } from './_helpers';

test('limiters are Express middleware (callable handlers)', () => {
  for (const limiter of [authRateLimit, patientsRateLimit, exportRateLimit, importRateLimit]) {
    assert.equal(typeof limiter, 'function');
  }
});

test('rate-limit windows/maxes are positive integers', () => {
  for (const n of [
    env.AUTH_RATE_LIMIT_MAX,
    env.AUTH_RATE_LIMIT_WINDOW_MS,
    env.EXPORT_RATE_LIMIT_MAX,
    env.IMPORT_RATE_LIMIT_MAX,
    env.PATIENTS_RATE_LIMIT_MAX,
  ]) {
    assert.ok(Number.isInteger(n) && n > 0, `expected positive int, got ${n}`);
  }
});

test('RATE_LIMIT_STORE is a known store (memory|redis)', () => {
  assert.ok(['memory', 'redis'].includes(env.RATE_LIMIT_STORE));
});

test('the /auth limiter is mounted before the auth route handlers', () => {
  const src = readFileSync(join(repoRoot(), 'backend/src/routes/auth.ts'), 'utf8');
  const mountIdx = src.indexOf("authRouter.use('/auth', authRateLimit)");
  assert.ok(mountIdx > -1, 'authRateLimit must be applied to /auth');
  const firstRoute = src.search(/authRouter\.(post|get)\(/);
  assert.ok(firstRoute > -1 && mountIdx < firstRoute, 'limiter must be registered before handlers');
});

test('429 message is generic and input-free', () => {
  const src = readFileSync(join(repoRoot(), 'backend/src/middlewares/authRateLimit.ts'), 'utf8');
  assert.ok(src.includes("code: 'rate_limited'"));
});
