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
import { clinicProfessionalsRouter } from './routes/clinicProfessionals';
import { appointmentsRouter } from './routes/appointments';
import { clinicJoinRequestsRouter } from './routes/clinicJoinRequests';
import { clinicMembersRouter } from './routes/clinicMembers';
import { clinicalEncountersRouter } from './routes/clinicalEncounters';
import { clinicalRolesRouter } from './routes/clinicalRoles';
import { clinicalReadAuditRouter } from './routes/clinicalReadAudit';
import { clinicalDocumentsRouter } from './routes/clinicalDocuments';
import { financialChargesRouter } from './routes/financialCharges';
import { reportsRouter } from './routes/reports';
import { clinicServicesRouter } from './routes/clinicServices';
import { insuranceRouter } from './routes/insurance';
import { inventoryRouter } from './routes/inventory';
import { billingRouter } from './routes/billing';
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

  // In production with multiple instances, an in-memory rate-limit store keeps
  // per-instance counters, so the effective limit becomes (max × instances) —
  // useless across the fleet. We warn (not fail) because memory is legitimate
  // for a single instance; multi-instance prod should set RATE_LIMIT_STORE=redis
  // (REDIS_URL required; the store fails fast on a bad connection at boot).
  if (env.NODE_ENV === 'production' && env.RATE_LIMIT_STORE === 'memory') {
    logger.warn(
      'RATE_LIMIT_STORE=memory in production: rate-limit counters are per-instance. ' +
        'If you run more than one instance, set RATE_LIMIT_STORE=redis (with REDIS_URL) ' +
        'so limits hold across the fleet.',
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
  app.use(clinicProfessionalsRouter);
  app.use(appointmentsRouter);
  app.use(clinicJoinRequestsRouter);
  app.use(clinicMembersRouter);
  // Clinical Prontuário v0.1 (Sprint 4.2B-3, ADR 0010). All routes are gated
  // by requireAuth + requireClinic + (requireClinicalRole | requireRole).
  // Logger redacts the 5 textual clinical fields + cancel/rectification
  // reason_text + paciente_id (config/logger.ts).
  app.use(clinicalRolesRouter);
  app.use(clinicalEncountersRouter);
  // Clinical Documents v0.1 (Sprint 4.3B, ADR 0011): receita/atestado/
  // declaração/exame/orientação. Same middleware shape as encounters;
  // strict-mode audit on every content read + PDF download.
  app.use(clinicalDocumentsRouter);
  // LGPD-art.18 transparency (Sprint 4.2E): owner-only read-audit listing.
  app.use(clinicalReadAuditRouter);
  // Financial Module v0.1 (Sprint 4.4B, ADR 0012). ADMINISTRATIVE — uses
  // requireRole, not requireClinicalRole. Fine-grained access (profissional
  // blocked, gestor downgraded to view+transact) lives in the service.
  app.use(financialChargesRouter);
  // Management Reports v0.1 (Sprint 4.5B, ADR 0014). Read-only administrative
  // aggregates. No clinical data, no PII in payloads.
  app.use(reportsRouter);
  // Catálogo de Serviços v0.1 (Sprint 4.6B, ADR 0015). ADMINISTRATIVE /
  // COMMERCIAL — uses requireRole, not requireClinicalRole. Owner-only writes;
  // reads open to dono_clinica + secretaria (agenda selector). NEVER auto-
  // propagates price or duration; NEVER carries clinical content.
  app.use(clinicServicesRouter);
  // Convênios v0.1 (Sprint 4.7B, ADR 0016). ADMINISTRATIVE / COMMERCIAL —
  // operadoras, planos, carteirinhas do paciente e preço de referência por
  // serviço × operadora. Owner-only writes para providers/plans/service_prices;
  // owner + secretaria para patient_insurances. NEVER carries clinical
  // content; reference_price_cents NEVER auto-propagates para
  // financial_charges.amount_cents. member_number/holder_name são PII com
  // redação ativa em config/logger.ts e ausentes em audit_logs.
  app.use(insuranceRouter);
  // Estoque básico v0.1 (Sprint 4.8B, ADR 0017). ADMINISTRATIVE / OPERATIONAL —
  // uses requireRole, not requireClinicalRole. profissional_clinico is
  // downgraded to 403 at the SERVICE layer (route-level requireRole admits
  // 'secretaria' which is also the papel of clinical-grant holders). Item
  // CRUD is dono_clinica only; movements are dono_clinica + secretaria.
  // current_quantity is mutated ONLY inside a SELECT FOR UPDATE transaction
  // alongside the matching inventory_movements insert. notes/reason are
  // administrative-only; logger redacts both, audit is metadata-only.
  app.use(inventoryRouter);
  // Plans, Billing & Entitlements v0.1 (Sprint 5.1B, ADR 0018). COMMERCIAL
  // layer — the SaaS charging the clinic (NOT the clinic's financial module,
  // ADR 0012). Read-only endpoint in 5.1B (GET /billing/status); commercial
  // state changes only by a verified webhook (future) or an audited manual
  // action. Mock provider only; no real gateway, no card data, no secrets.
  // Entitlements are computed/validated in the backend; the status payload
  // carries no PII, no money, and no provider external IDs.
  app.use(billingRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
