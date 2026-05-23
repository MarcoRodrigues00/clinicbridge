import crypto from 'node:crypto';
import { env } from './env';

// Encryption-at-rest for TOTP secrets (Sprint 3.19). AES-256-GCM with a key
// derived (HKDF-SHA256) from a dedicated MFA_ENCRYPTION_KEY when provided, else
// from JWT_SECRET. Deriving from JWT_SECRET keeps the MVP working in dev without a
// new required env, but couples the two secrets — see ressalva P1: production
// should set a dedicated MFA_ENCRYPTION_KEY (or a KMS). The plaintext TOTP secret
// is NEVER logged and never leaves this module except via decrypt() for verify.
//
// Format of the stored blob: base64( iv(12) | authTag(16) | ciphertext ).

const SALT = Buffer.from('clinicbridge-mfa-kdf-v1');
const INFO = Buffer.from('clinicbridge-mfa-secret');

function deriveKey(): Buffer {
  const source =
    env.MFA_ENCRYPTION_KEY && env.MFA_ENCRYPTION_KEY.trim().length > 0
      ? env.MFA_ENCRYPTION_KEY
      : env.JWT_SECRET;
  const derived = crypto.hkdfSync('sha256', Buffer.from(source), SALT, INFO, 32);
  return Buffer.from(derived);
}

const KEY = deriveKey();

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptSecret(blob: string): string {
  const buf = Buffer.from(blob, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
