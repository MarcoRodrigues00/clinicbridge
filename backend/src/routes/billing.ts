import { Router } from 'express';
import { billingController } from '../controllers/billingController';
import { billingWebhookController } from '../controllers/billingWebhookController';
import { requireAuth, requireClinic, requireRole } from '../middlewares/requireAuth';
import { billingWebhookRateLimit, patientsRateLimit } from '../middlewares/rateLimit';
import { asyncHandler } from '../utils/asyncHandler';

// Plans, Billing & Entitlements v0.1 (Sprint 5.1B; ADR 0018).
//
// COMMERCIAL layer (the SaaS charging the clinic) — separate from the clinic's
// internal financial module (ADR 0012). v0.1 exposes ONLY a read endpoint; the
// commercial state changes only by a verified webhook (future 5.1E) or an
// audited manual action (scripts/billing-admin.ts) — NEVER by a public route.
//
// Pipeline (mirrors the financial module):
//   1. IP-keyed rate limiter BEFORE auth (read → patientsRateLimit).
//   2. requireAuth (Bearer JWT).
//   3. requireClinic (DB-checked; admin_sistema blocked with no_clinic_context;
//      deactivated members blocked even with a valid JWT).
//   4. requireRole(['dono_clinica','secretaria']) — broad gate. Fine-grained
//      policy (profissional_clinico → 403) lives in the SERVICE.
const billingReadAllowlist = ['dono_clinica', 'secretaria'] as const;

export const billingRouter = Router();

// GET /billing/status — current plan/state/entitlements/soft-lock.
billingRouter.get(
  '/billing/status',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(billingReadAllowlist),
  asyncHandler(billingController.status),
);

// POST /billing/webhooks/asaas/sandbox — Sprint 5.1E (ADR 0018 §8/§10).
//
// SANDBOX-ONLY inbound provider webhook. NO requireAuth/requireClinic: the
// provider is authenticated by the shared `asaas-access-token` header, verified
// in the service (timing-safe; NOT an HMAC). The service 404s unless
// ASAAS_ENV=sandbox, so this route is inert by default. IP-rate-limited before
// the token check. Idempotent by UNIQUE(provider, external_event_id); the tenant
// is resolved from internal provider maps, NEVER from the payload.
billingRouter.post(
  '/billing/webhooks/asaas/sandbox',
  billingWebhookRateLimit,
  asyncHandler(billingWebhookController.asaasSandbox),
);

// POST /billing/webhooks/asaas/sandbox/withdrawal-validation — Sprint 5.1E.
//
// SANDBOX-only withdrawal authorization callback. Same posture as the webhook
// above: NO requireAuth/requireClinic (origin proven by the shared
// `asaas-access-token` header, verified in the service), IP-rate-limited, and
// 404 unless ASAAS_ENV=sandbox. Metadata-only and DEFAULT-DENY — v0.1 refuses
// every withdrawal and touches no subscription/soft-lock/financial/patient data.
billingRouter.post(
  '/billing/webhooks/asaas/sandbox/withdrawal-validation',
  billingWebhookRateLimit,
  asyncHandler(billingWebhookController.asaasSandboxWithdrawalValidation),
);
