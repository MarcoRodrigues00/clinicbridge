import cors, { type CorsOptions } from 'cors';
import { env } from '../config/env';
import { logger } from '../config/logger';

// Comma-separated allowlist. Empty entries are dropped so a trailing comma in
// the env doesn't accidentally become a "blank origin" match.
function parseOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const allowList = parseOrigins(env.FRONTEND_ORIGIN);

if (env.NODE_ENV === 'production' && allowList.includes('*')) {
  // Refuse to start with a wildcard origin in production — the master doc
  // (section 5.7) requires CORS to be restricted to the frontend domain.
  // eslint-disable-next-line no-console
  console.error('[cors] FRONTEND_ORIGIN must not be "*" in production');
  process.exit(1);
}

if (allowList.length === 0) {
  // eslint-disable-next-line no-console
  console.error('[cors] FRONTEND_ORIGIN is empty after parsing');
  process.exit(1);
}

const options: CorsOptions = {
  origin(origin, callback) {
    // Same-origin / non-browser callers (curl, server-to-server, health checks)
    // don't send Origin — let those through. CORS only protects browsers.
    if (!origin) {
      callback(null, true);
      return;
    }
    if (allowList.includes(origin)) {
      callback(null, true);
      return;
    }
    logger.warn({ origin }, 'cors: origin not allowed');
    // Do not pass an Error — cors will throw it and trip the error handler.
    // Just signal "not allowed"; the browser blocks the response.
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 600,
};

export const corsMiddleware = cors(options);
