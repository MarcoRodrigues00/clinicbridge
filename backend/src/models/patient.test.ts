// Unit tests for the patient CPF masking helper (LGPD/PII invariant).
//
// maskCpf is pure — these are the cheapest possible guard over the rule that
// raw CPF must NEVER leave the backend; only a masked form (last 5 digits) is
// ever exposed. Run: `pnpm --filter backend test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskCpf } from './patient';

test('maskCpf masks the first 6 digits and keeps the last 5', () => {
  assert.equal(maskCpf('12345678901'), '***.***.789-01');
});

test('maskCpf accepts formatted input and never echoes the full number', () => {
  const masked = maskCpf('123.456.789-01');
  assert.equal(masked, '***.***.789-01');
  assert.ok(!masked!.includes('123'));
  assert.ok(!masked!.includes('456'));
});

test('maskCpf returns null for null/undefined', () => {
  assert.equal(maskCpf(null), null);
  assert.equal(maskCpf(undefined), null);
});

test('maskCpf returns null for invalid length (never a partial leak)', () => {
  assert.equal(maskCpf('123'), null);
  assert.equal(maskCpf('123456789012345'), null);
});
