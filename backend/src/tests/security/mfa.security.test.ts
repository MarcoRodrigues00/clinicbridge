// R06 — MFA/TOTP and protection of authentication secrets.
//
// Guards that TOTP secrets are encrypted at rest (AES-256-GCM) and that the
// Asaas webhook token is verified with a constant-time compare. Plus a static
// check that the user DAO persists the encrypted column, never a plaintext one.
// Run: `pnpm --filter backend test:security`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encryptSecret, decryptSecret } from '../../config/mfaCrypto';
import { verifyAsaasToken } from '../../services/billingAsaasProvider';
import { repoRoot } from './_helpers';

const PLAINTEXT = 'JBSWY3DPEHPK3PXP'; // sample base32 TOTP secret (not real)

test('encryptSecret round-trips and never stores the plaintext', () => {
  const blob = encryptSecret(PLAINTEXT);
  assert.notEqual(blob, PLAINTEXT);
  assert.ok(!blob.includes(PLAINTEXT), 'ciphertext must not contain the plaintext secret');
  assert.equal(decryptSecret(blob), PLAINTEXT);
});

test('encrypting the same secret twice yields different blobs (random IV)', () => {
  assert.notEqual(encryptSecret(PLAINTEXT), encryptSecret(PLAINTEXT));
});

test('decryptSecret rejects a tampered blob (GCM auth tag)', () => {
  const blob = encryptSecret(PLAINTEXT);
  const buf = Buffer.from(blob, 'base64');
  buf[buf.length - 1] ^= 0xff; // flip a ciphertext byte
  assert.throws(() => decryptSecret(buf.toString('base64')));
});

test('verifyAsaasToken: matching token passes, everything else fails', () => {
  const secret = 'shared-webhook-token-abc123';
  assert.equal(verifyAsaasToken(secret, secret), true);
  assert.equal(verifyAsaasToken('wrong', secret), false);
  assert.equal(verifyAsaasToken('shared-webhook-token-abc12', secret), false); // length mismatch
  assert.equal(verifyAsaasToken(undefined, secret), false);
  assert.equal(verifyAsaasToken(secret, undefined), false);
  assert.equal(verifyAsaasToken('', ''), false);
});

test('user DAO persists the ENCRYPTED MFA secret column (never a plaintext one)', () => {
  const daoSrc = readFileSync(join(repoRoot(), 'backend/src/dao/userDao.ts'), 'utf8');
  assert.ok(daoSrc.includes('mfa_secret_encrypted'), 'must write mfa_secret_encrypted');
  assert.ok(
    !/\bmfa_secret\b(?!_encrypted)/.test(daoSrc),
    'must not write a plaintext mfa_secret column',
  );
});
