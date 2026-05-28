import { Router } from 'express';
import { billingController } from '../controllers/billingController';
import { requireAuth, requireClinic, requireRole } from '../middlewares/requireAuth';
import { patientsRateLimit } from '../middlewares/rateLimit';
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
