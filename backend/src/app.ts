import express, { type Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { logger } from './config/logger';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { importFilesRouter } from './routes/importFiles';
import { importPreviewRouter } from './routes/importPreview';
import { importValidationRouter } from './routes/importValidation';
import { importSessionsRouter } from './routes/importSessions';
import { patientsRouter } from './routes/patients';
import { corsMiddleware } from './middlewares/cors';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { requestId } from './middlewares/requestId';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');

  // Explicit, configurable trust-proxy posture (Sprint 3.2 via TRUST_PROXY).
  // X-Forwarded-* headers are only honored according to this setting. Trusting
  // them blindly would let any client spoof their source IP, breaking both rate
  // limiting and the accuracy of req.ip in audit_logs. Default 'false' = trust
  // nothing (correct when the API is exposed directly). Behind a reverse proxy
  // set TRUST_PROXY to the hop count (e.g. '1') or an Express preset.
  app.set('trust proxy', env.TRUST_PROXY);

  // In production, surface a strong warning when TRUST_PROXY was left at its
  // default. If the API actually sits behind a proxy, an unconfigured value
  // makes req.ip the proxy's IP, collapsing per-client rate limiting. We warn
  // (not fail) because 'false' is a legitimate value for a directly-exposed API.
  const trustProxyConfigured =
    process.env.TRUST_PROXY !== undefined && process.env.TRUST_PROXY.trim() !== '';
  if (env.NODE_ENV === 'production' && !trustProxyConfigured) {
    logger.warn(
      'TRUST_PROXY is not set; defaulting to "false" (no proxy trusted). If the API ' +
        'runs behind a reverse proxy (Nginx/Traefik/Cloudflare), set TRUST_PROXY to the ' +
        'correct hop count (e.g. 1) so rate limiting and req.ip use the real client IP.',
    );
  }

  // requestId must run before everything else so every downstream middleware,
  // including error handlers and audit writes, can see req.requestId and the
  // response carries X-Request-Id even on early failures.
  app.use(requestId);

  // helmet ships sensible defaults: HSTS, X-Content-Type-Options, frame-deny,
  // a strict CSP, referrer policy, etc. We keep the defaults; CSP can be
  // tightened per-route when we add real UI endpoints.
  app.use(helmet());

  // CORS allowlist is driven by FRONTEND_ORIGIN. Applied before json so
  // preflight OPTIONS requests answer before we try to parse a body.
  app.use(corsMiddleware);

  app.use(express.json({ limit: '100kb' }));

  app.use(healthRouter);
  app.use(authRouter);
  app.use(importFilesRouter);
  app.use(importPreviewRouter);
  app.use(importValidationRouter);
  app.use(importSessionsRouter);
  app.use(patientsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
