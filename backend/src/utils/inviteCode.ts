import crypto from 'node:crypto';

// Clinic invite codes (Sprint 3.24). Short, opaque, owner-shared codes used so a
// secretaria can request to join a clinic WITHOUT any clinic search/listing
// (avoids enumeration). Stored normalized (8 chars, no dash); displayed XXXX-XXXX.
// Alphabet excludes ambiguous characters (0/O/1/I/L). 31^8 ≈ 8.5e11 combinations.

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const LENGTH = 8;

// Canonical stored/lookup form: uppercase alphanumerics only (dashes/spaces stripped).
export function normalizeInviteCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function generateInviteCode(): string {
  let out = '';
  for (let i = 0; i < LENGTH; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

// Display form: two 4-char groups separated by a dash (e.g. AB2C-3DEF).
export function formatInviteCode(code: string): string {
  const c = normalizeInviteCode(code);
  return c.length === LENGTH ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}
