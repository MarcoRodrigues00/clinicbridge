// R04 — LGPD protection of PII and clinical data.
//
// Pure guards over the masking/neutralization helpers that keep raw PII from ever
// leaving the backend in bulk reads/exports:
//   - maskCpf: only the last 5 digits survive, never the first 6;
//   - maskMemberNumber: only the last 4 chars survive;
//   - neutralizeFormula: export cells can't smuggle a spreadsheet formula.
// Run: `pnpm --filter backend test:security`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskCpf, maskMemberNumber } from '../../models/patient';
import { neutralizeFormula } from '../../services/patientExportService';

test('maskCpf hides the first 6 digits and never echoes them', () => {
  const masked = maskCpf('12345678901');
  assert.equal(masked, '***.***.789-01');
  assert.ok(!masked!.includes('123456'), 'masked CPF must not contain the leading digits');
});

test('maskCpf refuses to partially leak an invalid-length value', () => {
  assert.equal(maskCpf('123'), null);
  assert.equal(maskCpf(null), null);
});

test('maskMemberNumber keeps only the last 4 chars', () => {
  const masked = maskMemberNumber('CARD-9876543210');
  assert.ok(masked!.endsWith('3210'));
  assert.ok(!masked!.includes('9876543'), 'must not expose the body of the card number');
  assert.notEqual(masked, 'CARD-9876543210');
});

test('neutralizeFormula prefixes every spreadsheet-dangerous lead char', () => {
  for (const lead of ['=', '+', '-', '@', '\t', '\r', '\n']) {
    const cell = `${lead}cmd|' /C calc'!A1`;
    assert.ok(neutralizeFormula(cell).startsWith("'"), `lead ${JSON.stringify(lead)} must be neutralized`);
  }
});

test('neutralizeFormula leaves ordinary text untouched', () => {
  assert.equal(neutralizeFormula('Maria Silva'), 'Maria Silva');
  assert.equal(neutralizeFormula('11999990000'), '11999990000');
});
