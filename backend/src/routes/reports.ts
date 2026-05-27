import { Router } from 'express';
import { reportsController } from '../controllers/reportsController';
import {
  requireAuth,
  requireClinic,
  requireRole,
} from '../middlewares/requireAuth';
import { patientsRateLimit } from '../middlewares/rateLimit';
import { asyncHandler } from '../utils/asyncHandler';

// Management Reports v0.1 (Sprint 4.5B; ADR 0014).
//
// READ-ONLY administrative endpoints. EVERY route follows the same pipeline:
//
//   1. IP-keyed rate limiter BEFORE auth (`patientsRateLimit` — read-style).
//   2. `requireAuth` (Bearer JWT).
//   3. `requireClinic` (DB-checked since Sprint 3.25 — deactivated members
//      cannot reach report endpoints even with a valid JWT; admin_sistema
//      is blocked here with no_clinic_context).
//   4. `requireRole(['dono_clinica','secretaria'])` — broad administrative
//      gate. Profissional users hold papel=secretaria and a clinical grant;
//      the service downgrades them to 403 for R-B / R-D via
//      effectiveFinancialAccess (mirrors the Financeiro v0.1 pattern).
//
// Smoke matrix (ADR 0014 §5, reconciled with docs/testing-checklist.md):
//   - smoke.owner       (papel=dono_clinica)                 → all 4 reports
//   - smoke.secretaria  (papel=secretaria, no grants)        → all 4 reports
//   - smoke.gestor      (papel=secretaria + gestor_clinica)  → all 4 reports
//   - smoke.profissional(papel=secretaria + profissional_*)  → R-A, R-C OK;
//                                                              R-B, R-D 403
//   - smoke.admin       (papel=admin_sistema)                → 403 no_clinic_context
const reportsAdminAllowlist = ['dono_clinica', 'secretaria'] as const;

export const reportsRouter = Router();

// GET /reports/appointments — R-A.
reportsRouter.get(
  '/reports/appointments',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(reportsAdminAllowlist),
  asyncHandler(reportsController.appointments),
);

// GET /reports/financial — R-B.
reportsRouter.get(
  '/reports/financial',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(reportsAdminAllowlist),
  asyncHandler(reportsController.financial),
);

// GET /reports/patients — R-C.
reportsRouter.get(
  '/reports/patients',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(reportsAdminAllowlist),
  asyncHandler(reportsController.patients),
);

// GET /reports/agenda-financial — R-D.
reportsRouter.get(
  '/reports/agenda-financial',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(reportsAdminAllowlist),
  asyncHandler(reportsController.agendaFinancial),
);
