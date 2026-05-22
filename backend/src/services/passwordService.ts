import argon2 from 'argon2';
import { logger } from '../config/logger';

// OWASP 2023 minimum for argon2id with personal-data workloads.
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 46 * 1024,
  timeCost: 1,
  parallelism: 1,
};

export const passwordService = {
  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON2_OPTIONS);
  },

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch (err) {
      // Log without the hash or plain value. A failure here usually means a corrupted
      // stored hash or an argon2 runtime problem — operations should be alerted.
      logger.error({ err }, 'passwordService.verify failed');
      return false;
    }
  },
};
