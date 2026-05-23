import crypto from 'node:crypto';
import { mfaBackupCodeDao } from '../dao/mfaBackupCodeDao';
import { passwordService } from './passwordService';

// MFA backup (recovery) codes (Sprint 3.21).
//
// - Codes are high-entropy, single-use, shown to the user ONLY once on
//   generation/regeneration. We store only their argon2id HASH (reusing
//   passwordService, the project's existing argon2 wrapper) — never plaintext.
// - The alphabet excludes ambiguous characters (0/O/1/I/L). A 10-char code over
//   a 31-symbol alphabet is ~49.5 bits of entropy.
// - normalize() makes input forgiving (case / dashes / spaces) without weakening
//   matching: codes only ever contain the alphabet's characters.

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 10; // characters per code (excluding the formatting dash)
const CODE_COUNT = 10; // codes generated per set
const MIN_NORMALIZED_LEN = CODE_LENGTH;

function randomCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return out;
}

// Display form: two 5-char groups separated by a dash (e.g. ABCDE-FGHJK).
function format(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

// Canonical form used for hashing and verification: uppercase, alphanumerics only.
function normalize(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export const mfaBackupCodeService = {
  CODE_COUNT,

  // Generates a fresh set of plaintext codes (to show the user once) plus their
  // hashes (to persist). Hashing is sequential to bound peak memory under argon2.
  async generate(): Promise<{ codes: string[]; hashes: string[] }> {
    const set = new Set<string>();
    while (set.size < CODE_COUNT) set.add(randomCode());
    const raw = [...set];
    const hashes: string[] = [];
    for (const code of raw) {
      hashes.push(await passwordService.hash(normalize(code)));
    }
    return { codes: raw.map(format), hashes };
  },

  // Verifies a candidate code against the user's UNUSED codes and, on a match,
  // marks it used (single-use, compare-and-set). Returns true only when a code
  // was matched AND consumed by this call. Never logs the code.
  async consume(userId: string, input: string): Promise<boolean> {
    const normalized = normalize(input);
    if (normalized.length < MIN_NORMALIZED_LEN) return false;
    const rows = await mfaBackupCodeDao.listUnusedByUser(userId);
    for (const row of rows) {
      if (await passwordService.verify(row.code_hash, normalized)) {
        return mfaBackupCodeDao.markUsed(row.id, userId);
      }
    }
    return false;
  },
};
