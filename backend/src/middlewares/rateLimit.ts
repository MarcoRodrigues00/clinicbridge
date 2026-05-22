import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { createRateLimitStore } from '../config/rateLimitStore';

// Shared factory for the per-group limiters added in Sprint 2.22. Mirrors the
// older authRateLimit/uploadRateLimit shape: IP-keyed, draft-7 headers, and a
// generic 429 body that never echoes caller input nor reveals whether the
// request would have succeeded. Each limiter has its own counter (store), so a
// burst on one group never throttles another.
//
// Sprint 3.2: `scope` selects the store namespace. In memory mode the store is
// undefined (built-in per-limiter MemoryStore); in redis mode it is a shared
// RedisStore prefixed by scope, so counters are consistent across instances.
function makeRateLimit(scope: string, windowMs: number, limit: number, message: string) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: createRateLimitStore(scope),
    message: { error: { code: 'rate_limited', message } },
  });
}

// Read endpoints over patient data: GET /patients and GET /patients/duplicates.
// Generous — the dashboard loads both on mount and the user browses/searches.
export const patientsRateLimit = makeRateLimit(
  'patients',
  env.PATIENTS_RATE_LIMIT_WINDOW_MS,
  env.PATIENTS_RATE_LIMIT_MAX,
  'Muitas requisições. Aguarde alguns minutos e tente novamente.',
);

// Export endpoint (CSV/XLSX). Heavier than a read — generates a file from up to
// PATIENTS_EXPORT_MAX_ROWS rows — so it gets a stricter, dedicated limiter.
export const exportRateLimit = makeRateLimit(
  'export',
  env.EXPORT_RATE_LIMIT_WINDOW_MS,
  env.EXPORT_RATE_LIMIT_MAX,
  'Muitas exportações. Aguarde alguns minutos e tente novamente.',
);

// Import pipeline: preview, validate, create session, dry-run, mark-ready,
// import. Each re-parses the uploaded file, so cap repeated calls per IP.
export const importRateLimit = makeRateLimit(
  'import',
  env.IMPORT_RATE_LIMIT_WINDOW_MS,
  env.IMPORT_RATE_LIMIT_MAX,
  'Muitas requisições. Aguarde alguns minutos e tente novamente.',
);
