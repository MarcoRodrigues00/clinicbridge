// R10 — Operational & infrastructure security (git/secrets hygiene).
//
// Static repository checks (no app import, no DB):
//   - no secret/data file is tracked by git (.env, keys, certs, dumps, CSV/XLSX, zip);
//   - .gitignore covers those patterns;
//   - the backend Docker image build context excludes .env;
//   - .env.example IS tracked and the real .env is NOT.
// This mirrors the CI "tracked sensitive files" gate so it also runs locally via
// `pnpm --filter backend test:security`. Run from anywhere in the repo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './_helpers';

const ROOT = repoRoot();

function trackedFiles(): string[] {
  return execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Same shape as the workflow's grep gate.
const SENSITIVE_RE = /(^|\/)\.env$|\.pem$|\.key$|\.crt$|\.sql$|\.dump$|\.csv$|\.xlsx$|\.zip$/;

test('no secret/data file is tracked by git', () => {
  const offenders = trackedFiles().filter((f) => SENSITIVE_RE.test(f));
  assert.deepEqual(offenders, [], `sensitive files must never be tracked: ${offenders.join(', ')}`);
});

test('.env is not tracked but .env.example is', () => {
  const files = trackedFiles();
  assert.ok(!files.includes('.env'), '.env must never be committed');
  assert.ok(files.includes('.env.example'), '.env.example must be committed as the template');
});

test('.gitignore covers secrets, dumps and tabular data', () => {
  const gi = readFileSync(join(ROOT, '.gitignore'), 'utf8');
  for (const pat of ['.env', '*.pem', '*.key', '*.sql', '*.csv', '*.xlsx', '*.zip', '*.dump', 'storage/']) {
    assert.ok(gi.includes(pat), `.gitignore must include ${pat}`);
  }
});

test('the backend Docker build context excludes .env', () => {
  const di = readFileSync(join(ROOT, '.dockerignore'), 'utf8');
  assert.ok(/(^|\n)\.env/.test(di) || di.includes('.env'), '.dockerignore must exclude .env');
});
