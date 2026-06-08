// R09 — Secure configuration per environment and production lockdowns.
//
// Drives the real env schema (EnvSchema) and asserts the production guards reject
// insecure configurations: placeholder secrets, localhost/HTTP CORS, a missing
// MFA key, and a non-disabled payment gateway. Also confirms a dev config with
// localhost is fine and a fully-valid production config passes. Pure: no boot, no
// DB. Run: `pnpm --filter backend test:security`.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { EnvSchema } from '../../config/env';

const STRONG = 'a'.repeat(64); // ≥48 chars, no placeholder marker

// A fully-valid production baseline. Individual tests override one field to make
// it insecure and assert the matching guard fires.
function prodBase(): Record<string, string> {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://appuser:s3cr3t@db.internal.example.com:5432/clinicbridge',
    JWT_SECRET: STRONG,
    FRONTEND_ORIGIN: 'https://app.clinicbridge.com.br',
    MFA_ENCRYPTION_KEY: STRONG,
    ASAAS_ENV: 'disabled',
    CLINICAL_READ_AUDIT_STRICT: 'true',
  };
}

function failsOn(overrides: Record<string, string | undefined>, path: string): void {
  const cfg = { ...prodBase(), ...overrides };
  const res = EnvSchema.safeParse(cfg);
  assert.equal(res.success, false, `expected config to be rejected for ${path}`);
  if (!res.success) {
    assert.ok(
      res.error.issues.some((i) => i.path.includes(path)),
      `expected a validation issue on ${path}; got ${JSON.stringify(res.error.issues.map((i) => i.path))}`,
    );
  }
}

// The production CLINICAL_READ_AUDIT_STRICT guard re-reads process.env directly,
// so the suite must set it to 'true' to isolate the other guards under test.
let savedStrict: string | undefined;
before(() => {
  savedStrict = process.env.CLINICAL_READ_AUDIT_STRICT;
  process.env.CLINICAL_READ_AUDIT_STRICT = 'true';
});
after(() => {
  if (savedStrict === undefined) delete process.env.CLINICAL_READ_AUDIT_STRICT;
  else process.env.CLINICAL_READ_AUDIT_STRICT = savedStrict;
});

test('production rejects the JWT_SECRET placeholder', () => {
  failsOn({ JWT_SECRET: 'replace-with-output-of-openssl-rand-hex-32-at-least-48-chars' }, 'JWT_SECRET');
});

test('production rejects a too-short JWT_SECRET', () => {
  failsOn({ JWT_SECRET: 'short' }, 'JWT_SECRET');
});

test('production rejects the local DATABASE_URL placeholder password', () => {
  failsOn(
    { DATABASE_URL: 'postgresql://clinicbridge:change-me-locally@localhost:5432/clinicbridge' },
    'DATABASE_URL',
  );
});

test('production rejects a localhost FRONTEND_ORIGIN', () => {
  failsOn({ FRONTEND_ORIGIN: 'http://localhost:5173' }, 'FRONTEND_ORIGIN');
});

test('production rejects an http:// (non-TLS) FRONTEND_ORIGIN', () => {
  failsOn({ FRONTEND_ORIGIN: 'http://app.clinicbridge.com.br' }, 'FRONTEND_ORIGIN');
});

test('production requires a dedicated MFA_ENCRYPTION_KEY (≥32 chars)', () => {
  failsOn({ MFA_ENCRYPTION_KEY: undefined }, 'MFA_ENCRYPTION_KEY');
  failsOn({ MFA_ENCRYPTION_KEY: 'too-short' }, 'MFA_ENCRYPTION_KEY');
});

test('production refuses a non-disabled payment gateway (ASAAS_ENV)', () => {
  failsOn({ ASAAS_ENV: 'sandbox', ASAAS_API_KEY: 'x', ASAAS_WEBHOOK_TOKEN: 'y' }, 'ASAAS_ENV');
});

test('a fully-valid production config passes', () => {
  const res = EnvSchema.safeParse(prodBase());
  assert.equal(res.success, true, res.success ? '' : JSON.stringify(res.error.issues));
});

test('a dev config with localhost is accepted (guards only fire in production)', () => {
  const res = EnvSchema.safeParse({
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://clinicbridge:change-me-locally@localhost:5432/clinicbridge',
    JWT_SECRET: STRONG,
    FRONTEND_ORIGIN: 'http://localhost:5173',
  });
  assert.equal(res.success, true, res.success ? '' : JSON.stringify(res.error.issues));
});
