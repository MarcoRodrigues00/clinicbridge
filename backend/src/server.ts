import { env } from './config/env';
import { logger } from './config/logger';
import { closeRateLimitStore, initRateLimitStore } from './config/rateLimitStore';

async function main(): Promise<void> {
  // Connect the shared rate-limit store BEFORE anything that creates a limiter.
  // In redis mode this fails fast on a bad connection (production must not
  // silently fall back to per-instance memory counters). In memory mode it is
  // effectively a no-op.
  await initRateLimitStore();

  // Import the app AFTER the store is connected: the limiter modules build their
  // RedisStore (and run store.init → script load) at import time, so the Redis
  // client must already be open. Dynamic import enforces that ordering.
  const { createApp } = await import('./app');
  const app = createApp();

  const server = app.listen(env.BACKEND_PORT, () => {
    logger.info({ port: env.BACKEND_PORT, env: env.NODE_ENV }, 'backend listening');
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'shutdown signal received');
    server.close(() => {
      void closeRateLimitStore().finally(() => {
        logger.info('http server closed');
        process.exit(0);
      });
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  logger.error(
    { err: err instanceof Error ? err.message : 'startup failed' },
    'failed to start backend',
  );
  process.exit(1);
});
