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
  // in production by the cors middleware itself. The dev default lists both 5173
  // and 5174 because Vite auto-bumps to 5174 when 5173 is already taken (e.g.
  // another local app), and a mismatched origin silently blocks login/demo.
  FRONTEND_ORIGIN: z
    .string()
    .default('http://localhost:5173,http://localhost:5174'),

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

  // MFA/TOTP secret encryption-at-rest key (Sprint 3.19). OPTIONAL: when unset,
  // the key is derived from JWT_SECRET (works in dev). In production, set a
  // dedicated value (P1). Never logged.
  MFA_ENCRYPTION_KEY: z.string().optional(),

  // Guided demo login (Sprint 5.0E). When 'true'/'1', enables POST /auth/demo-login,
  // which issues a session for the pre-seeded demo owner of "Clínica Demo Aurora"
  // WITHOUT accepting any credentials. Off by default; the endpoint also refuses
  // whenever NODE_ENV=production (dev/staging-only, same posture as the demo seed).
  // No password ever leaves the server; the demo identity is fixed server-side.
  ALLOW_DEMO_LOGIN: z
    .string()
    .default('false')
    .transform((raw): boolean => {
      const v = raw.trim().toLowerCase();
      return v === 'true' || v === '1';
    }),

  // Clinical read audit posture (Sprint 4.2B-1, ADR 0010 §8.2.1). Controls
  // whether failure to persist a row in `clinical_read_audit` BLOCKS the
  // clinical content response.
  //   - false (default in dev/test): best-effort — failure is logged at
  //     `error` level and the read continues. Acceptable ONLY with synthetic
  //     data because the compensating control for missing column-level
  //     encryption is the audit itself (ADR 0010 §13).
  //   - true: fail-closed — failure aborts the response with 500
  //     `clinical_read_audit_unavailable`; clinical content NEVER leaves the
  //     server without an audit row.
  // Accepted raw values (case- and whitespace-insensitive): 'true', '1',
  // 'false', '0', or unset (treated as false). Any other value FAILS env
  // validation in ALL environments — no silent fallback. The production
  // guard in superRefine additionally requires the raw value to be exactly
  // 'true' or '1'.
  CLINICAL_READ_AUDIT_STRICT: z
    .string()
    .optional()
    .transform((raw, ctx): boolean => {
      if (raw === undefined) return false;
      const v = raw.trim().toLowerCase();
      if (v === '' || v === 'false' || v === '0') return false;
      if (v === 'true' || v === '1') return true;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "CLINICAL_READ_AUDIT_STRICT must be 'true', '1', 'false', '0', or unset. " +
          'Received an unsupported value; refusing to start to avoid an unsafe default.',
      });
      return z.NEVER;
    }),

  // Asaas billing gateway — SANDBOX only (Sprint 5.1E, ADR 0018 §13).
  // COMMERCIAL layer (the SaaS charging the clinic) — NOT the clinic's financial
  // module (ADR 0012). 'disabled' (default): no adapter wired; the sandbox
  // webhook route returns 404 and outbound Asaas calls refuse. 'sandbox':
  // enables the sandbox adapter + the env-gated webhook route. There is NO
  // 'production' value on purpose — a real gateway is forbidden until the
  // production-security ADR (5.2A); the production guard below also rejects any
  // non-'disabled' value when NODE_ENV=production.
  ASAAS_ENV: z.enum(['disabled', 'sandbox']).default('disabled'),
  // Sandbox API key (Asaas Integrações → new key; shown once, irrecoverable).
  // SECRET — read only from env, never committed, never logged. Required when
  // ASAAS_ENV=sandbox (enforced below).
  ASAAS_API_KEY: z.string().optional(),
  // Shared token Asaas sends in the `asaas-access-token` webhook header. This is
  // NOT an HMAC signature — verification is a timing-safe equality check
  // (billingAsaasProvider.ts). SECRET — never logged. Required when
  // ASAAS_ENV=sandbox (enforced below).
  ASAAS_WEBHOOK_TOKEN: z.string().optional(),
}).superRefine((val, ctx) => {
  if (val.RATE_LIMIT_STORE === 'redis' && !val.REDIS_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['REDIS_URL'],
      message: 'REDIS_URL is required when RATE_LIMIT_STORE=redis.',
    });
  }

  // Asaas sandbox needs BOTH secrets to be meaningful: the API key for outbound
  // calls and the webhook token for verification. Enforcing presence stops a
  // half-configured sandbox from silently accepting unverified webhooks.
  if (val.ASAAS_ENV === 'sandbox') {
    if (!val.ASAAS_API_KEY || val.ASAAS_API_KEY.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ASAAS_API_KEY'],
        message: 'ASAAS_API_KEY is required when ASAAS_ENV=sandbox (sandbox key only — never a real key).',
      });
    }
    if (!val.ASAAS_WEBHOOK_TOKEN || val.ASAAS_WEBHOOK_TOKEN.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ASAAS_WEBHOOK_TOKEN'],
        message: 'ASAAS_WEBHOOK_TOKEN is required when ASAAS_ENV=sandbox.',
      });
    }
  }

  // Production guards (Sprint 3.6 + 3.39). Refuse to boot production with the
  // committed .env.example placeholders or insecure defaults. These only fire
  // when NODE_ENV=production, so dev and test are unaffected.
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

    // MFA_ENCRYPTION_KEY must be a dedicated secret in production (Sprint 3.39).
    // Falling back to JWT_SECRET couples two unrelated secrets; if JWT_SECRET
    // rotates, all stored TOTP secrets are silently invalidated. Min 32 chars
    // ensures a reasonable entropy floor (openssl rand -hex 32 → 64 chars is
    // the recommended format). The value is never logged.
    if (!val.MFA_ENCRYPTION_KEY || val.MFA_ENCRYPTION_KEY.trim().length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MFA_ENCRYPTION_KEY'],
        message:
          'MFA_ENCRYPTION_KEY is required in production and must be at least 32 characters. ' +
          'Generate with: openssl rand -hex 32',
      });
    }

    // FRONTEND_ORIGIN must not include localhost or non-HTTPS origins in
    // production (Sprint 3.39). The default is http://localhost:5173 which is
    // safe for dev but wrong for production. Each origin is checked individually
    // so a comma-separated list with one bad entry fails cleanly.
    const badFrontendOrigins = val.FRONTEND_ORIGIN.split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .filter(
        (o) =>
          o.includes('localhost') ||
          o.includes('127.0.0.1') ||
          o.startsWith('http://'),
      );
    if (badFrontendOrigins.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['FRONTEND_ORIGIN'],
        message:
          'FRONTEND_ORIGIN must contain only HTTPS origins with real domains in production ' +
          '(no localhost, no 127.0.0.1, no http://). Example: https://app.clinicbridge.com.br',
      });
    }

    // CLINICAL_READ_AUDIT_STRICT must be exactly 'true' in production
    // (Sprint 4.2B-1, ADR 0010 §8.2.1). The clinical read audit is the
    // PRIMARY COMPENSATING CONTROL for the absence of column-level
    // encryption (ADR 0010 §13). Best-effort mode is acceptable ONLY in
    // dev/staging with synthetic data; with real clinical data, missing
    // an audit row means losing LGPD-art.18 traceability and retrospective
    // detection of improper access. We re-read process.env here because the
    // transform above already collapsed 'false'/unset to the same boolean —
    // we need to distinguish "explicitly true" from "missing/false" to fail
    // fast at boot. Aligns with the Sprint 3.39 guard pattern.
    const rawClinicalStrict = (process.env.CLINICAL_READ_AUDIT_STRICT ?? '').trim().toLowerCase();
    if (rawClinicalStrict !== 'true' && rawClinicalStrict !== '1') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CLINICAL_READ_AUDIT_STRICT'],
        message:
          'CLINICAL_READ_AUDIT_STRICT must be set to "true" in production (ADR 0010 §8.2.1). ' +
          'Clinical content reads must be fail-closed when audit persistence fails; ' +
          'best-effort mode is acceptable only in dev/staging with synthetic data.',
      });
    }

    // No real payment gateway in production until the production-security ADR
    // (5.2A). Until then the gateway runs in mock/sandbox only — refuse to boot
    // production with the Asaas adapter enabled (Sprint 5.1E, ADR 0018 §15).
    if (val.ASAAS_ENV !== 'disabled') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ASAAS_ENV'],
        message:
          'ASAAS_ENV must be "disabled" in production: a real/sandbox payment gateway is ' +
          'forbidden until the production-security ADR (5.2A).',
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
