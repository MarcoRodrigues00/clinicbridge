// R05 — Audit and metadata-only traceability (log/secret redaction net).
//
// Detective static check: the pino redaction config must cover the PII and secret
// keys that should NEVER reach a log line, even via an accidental
// `logger.error({ err, body })`. We read the logger source so the assertion does
// not depend on capturing a live log stream. The append-only audit schema and the
// audit-row-on-sensitive-action behavior are exercised against a real database in
// src/tests/integration/{governance,financial}.integration.test.ts.
// Run: `pnpm --filter backend test:security`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './_helpers';

const loggerSrc = readFileSync(
  join(repoRoot(), 'backend/src/config/logger.ts'),
  'utf8',
);

const MUST_REDACT = [
  // Auth / identity secrets
  'authorization',
  'cookie',
  'password',
  'senha',
  'token',
  'cpf',
  // Clinical content (ADR 0010/0011)
  'chief_complaint',
  'anamnesis',
  'evolution',
  'internal_note',
  'metadata_json',
  // Convênio PII (ADR 0016)
  'member_number',
  'holder_name',
  // Financial (ADR 0012)
  'amount_cents',
  // Billing gateway secrets (ADR 0018)
  'asaas_api_key',
  'asaas_webhook_token',
];

for (const key of MUST_REDACT) {
  test(`logger redaction config covers "${key}"`, () => {
    assert.ok(
      loggerSrc.includes(`'${key}'`) || loggerSrc.includes(`"${key}"`) || loggerSrc.includes(key),
      `logger.ts redactPaths must list ${key}`,
    );
  });
}

test('logger uses remove:true so redacted fields are dropped, not just masked', () => {
  assert.match(loggerSrc, /remove:\s*true/);
});
