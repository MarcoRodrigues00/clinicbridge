import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  BACKEND_PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z
    .string()
    .min(48, 'JWT_SECRET must be at least 48 characters (recommended: openssl rand -hex 32)'),
  JWT_EXPIRES_IN: z.string().default('1h'),

  // CORS — comma-separated list of allowed origins. Wildcard ('*') is rejected
  // in production by the cors middleware itself.
  FRONTEND_ORIGIN: z.string().default('http://localhost:5173'),

  // Auth rate limiting (express-rate-limit). 20 requests / 15 min / IP fits the
  // MVP and is configurable so load tests / CI can override without code changes.
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),

  // Upload storage (Sprint 2). Files land in a PRIVATE local directory, never a
  // public/web-served folder. UPLOAD_MAX_BYTES defaults to 5 MB.
  UPLOAD_DIR: z.string().default('./storage/uploads'),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(5_242_880),

  // Upload rate limiting (Sprint 2.1). Scoped to POST /import-files/upload only,
  // independent from the /auth limiter. 30 uploads / 15 min / IP by default.
  UPLOAD_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  UPLOAD_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),

  // Preview limits (Sprint 2.2). Caps how much of an uploaded file we ever read
  // back to the client — never the whole file.
  PREVIEW_MAX_ROWS: z.coerce.number().int().positive().default(10),
  PREVIEW_MAX_COLUMNS: z.coerce.number().int().positive().default(30),

  // Full-file validation (Sprint 2.6). Bounds how much of a file we analyze and
  // how many issues we return — the report is a summary, never the raw data.
  VALIDATION_MAX_ROWS: z.coerce.number().int().positive().default(20_000),
  VALIDATION_MAX_ISSUES_RETURNED: z.coerce.number().int().positive().default(100),

  // Import dry-run (Sprint 2.12). Simulates an import without writing any rows.
  DRY_RUN_MAX_ROWS: z.coerce.number().int().positive().default(20_000),
  DRY_RUN_MAX_ISSUES_RETURNED: z.coerce.number().int().positive().default(100),
  DRY_RUN_SAMPLE_ROWS: z.coerce.number().int().positive().default(20),

  // Real import (Sprint 2.16). Hard cap on how many rows can be persisted in a
  // single execution. Conservative on purpose — the first real import is small,
  // auditable, and reviewed before raising the limit.
  IMPORT_MAX_ROWS: z.coerce.number().int().positive().default(100),

  // Patient listing (Sprint 2.19). Read-only, paginated. The default page size
  // is used when the client omits ?limit; the max caps any client-supplied
  // limit so a single request can't pull the whole table.
  PATIENTS_LIST_DEFAULT_LIMIT: z.coerce.number().int().positive().default(50),
  PATIENTS_LIST_MAX_LIMIT: z.coerce.number().int().positive().default(100),

  // Duplicate detection (Sprint 2.20). Read-only scan. Caps how many patient
  // rows are loaded per scan so a large clinic can't trigger an unbounded read.
  DUPLICATES_SCAN_MAX_ROWS: z.coerce.number().int().positive().default(5000),

  // Patient export (Sprint 2.21). Read-only CSV/XLSX. Caps rows per export;
  // above the cap the request fails with patients_export_too_large.
  PATIENTS_EXPORT_MAX_ROWS: z.coerce.number().int().positive().default(5000),

  // Rate limiting hardening (Sprint 2.22). Per-group, IP-keyed limiters. Same
  // <SCOPE>_RATE_LIMIT_* naming as the existing AUTH_/UPLOAD_ limiters. Defaults
  // are intentionally generous so normal MVP usage is never throttled.
  // Patient reads: GET /patients, GET /patients/duplicates.
  PATIENTS_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  PATIENTS_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  // Export (heavier — generates a file): GET /patients/export.
  EXPORT_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  EXPORT_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  // Import pipeline: preview, validate, sessions, dry-run, mark-ready, import.
  IMPORT_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  IMPORT_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),

  // Import-file retention (Sprint 2.24). DRY-RUN ONLY — nothing is deleted yet.
  // RETENTION_DAYS: a file is a cleanup candidate once it is older than this.
  // DRY_RUN_MAX: caps how many candidates the dry-run scan returns per request.
  IMPORT_FILE_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  IMPORT_FILE_RETENTION_DRY_RUN_MAX: z.coerce.number().int().positive().default(100),

  // Trust proxy posture (Sprint 3.2). Controls Express's `trust proxy` setting,
  // which decides whether X-Forwarded-* headers are honored for req.ip (used by
  // rate limiting and audit logs). Default 'false' = trust nothing (correct when
  // the API is exposed directly, as in the MVP). Behind a reverse proxy set the
  // hop count (e.g. '1' for one proxy) or an Express preset ('loopback', etc.).
  // Accepts: 'false'/'0', 'true', a positive integer, or a pass-through string.
  TRUST_PROXY: z
    .string()
    .default('false')
    .transform((raw): boolean | number | string => {
      const v = raw.trim().toLowerCase();
      if (v === '' || v === 'false' || v === '0') return false;
      if (v === 'true') return true;
      if (/^\d+$/.test(v)) return Number(v);
      return raw.trim();
    }),

  // Rate-limit store (Sprint 3.2). 'memory' (default) uses express-rate-limit's
  // built-in per-instance MemoryStore — fine for dev/single-instance. 'redis'
  // uses a shared store so counters are consistent across multiple instances
  // (required before horizontal scaling in production).
  RATE_LIMIT_STORE: z.enum(['memory', 'redis']).default('memory'),
  // Connection URL for the shared store. Required only when RATE_LIMIT_STORE=redis
  // (enforced by superRefine below). May carry credentials — never logged.
  REDIS_URL: z.string().url().optional(),
  // Key prefix so rate-limit keys are namespaced (and never collide with other
  // Redis users). Per-scope suffix is appended per limiter (auth/upload/...).
  REDIS_PREFIX: z.string().default('clinicbridge:ratelimit:'),
  // How long to wait for the initial Redis connection before failing startup.
  RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

  // Readiness probe (Sprint 3.7). Max time the GET /health/ready DB check waits
  // before reporting the database as not ready. Kept short so an orchestrator/
  // proxy gets a fast 503 instead of hanging on knex's long acquire timeout.
  HEALTH_READY_DB_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
}).superRefine((val, ctx) => {
  if (val.RATE_LIMIT_STORE === 'redis' && !val.REDIS_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['REDIS_URL'],
      message: 'REDIS_URL is required when RATE_LIMIT_STORE=redis.',
    });
  }

  // Production guards (Sprint 3.6). Refuse to boot production with the committed
  // .env.example placeholders. These only fire when NODE_ENV=production, so dev
  // and test are unaffected.
  if (val.NODE_ENV === 'production') {
    // The JWT_SECRET placeholder is longer than 48 chars, so the min(48) check
    // above does NOT catch it. Without this guard production could run on the
    // public example secret.
    if (/replace-with|change-me/i.test(val.JWT_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message:
          'JWT_SECRET still uses the .env.example placeholder. Set a strong secret in production (openssl rand -hex 32).',
      });
    }
    // The local DB password placeholder must never reach production.
    if (/change-me-locally/i.test(val.DATABASE_URL)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message:
          'DATABASE_URL still uses the local placeholder password. Use real, secret DB credentials in production.',
      });
    }
  }
});

export type AppEnv = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  // eslint-disable-next-line no-console
  console.error('[env] invalid configuration:\n' + issues.map((l) => '  - ' + l).join('\n'));
  process.exit(1);
}

export const env: AppEnv = parsed.data;
