import { createClient } from 'redis';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import type { Store } from 'express-rate-limit';
import { env } from './env';
import { logger } from './logger';

// Shared rate-limit store wiring (Sprint 3.2).
//
// memory mode: createRateLimitStore() returns undefined, so each limiter keeps
// express-rate-limit's built-in per-instance MemoryStore. No Redis needed.
//
// redis mode: a SINGLE Redis connection is shared by all limiters; each limiter
// gets its own RedisStore with a distinct key prefix so their counters stay
// independent (mirroring the per-limiter isolation of memory mode), yet are
// shared across app instances. REDIS_URL is never logged (it may carry creds).

type RedisClient = ReturnType<typeof createClient>;

let client: RedisClient | null = null;

function getClient(): RedisClient {
  if (client) return client;
  const c = createClient({
    url: env.REDIS_URL,
    socket: { connectTimeout: env.RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS },
  });
  // Only the error message is logged — never the URL/credentials.
  c.on('error', (err: unknown) => {
    logger.error(
      { err: err instanceof Error ? err.message : 'redis client error' },
      'rate-limit redis client error',
    );
  });
  client = c;
  return c;
}

export function createRateLimitStore(scope: string): Store | undefined {
  if (env.RATE_LIMIT_STORE !== 'redis') return undefined;
  const c = getClient();
  return new RedisStore({
    // node-redis' reply type is broader than rate-limit-redis' RedisReply; the
    // values exchanged here are only the integers/strings the store uses.
    sendCommand: (...args: string[]): Promise<RedisReply> =>
      c.sendCommand(args) as unknown as Promise<RedisReply>,
    prefix: `${env.REDIS_PREFIX}${scope}:`,
  });
}

// Called once at bootstrap (before app.listen). In redis mode this opens the
// shared connection and FAILS FAST if it can't connect — we never silently
// degrade to per-instance memory counters, which would make the limit useless
// across instances. In memory mode it is a no-op beyond a log line.
export async function initRateLimitStore(): Promise<void> {
  if (env.RATE_LIMIT_STORE !== 'redis') {
    logger.info({ store: 'memory' }, 'rate-limit store ready');
    return;
  }
  const c = getClient();
  await c.connect();
  logger.info({ store: 'redis', prefix: env.REDIS_PREFIX }, 'rate-limit store connected');
}

// Best-effort close on shutdown so the process can exit cleanly.
export async function closeRateLimitStore(): Promise<void> {
  if (!client) return;
  try {
    await client.quit();
  } catch {
    // Ignore — we are shutting down anyway.
  }
}
