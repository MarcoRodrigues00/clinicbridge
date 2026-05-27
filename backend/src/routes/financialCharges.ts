import { Router } from 'express';
import { financialChargeController } from '../controllers/financialChargeController';
import {
  requireAuth,
  requireClinic,
  requireRole,
} from '../middlewares/requireAuth';
import { importRateLimit, patientsRateLimit } from '../middlewares/rateLimit';
import { asyncHandler } from '../utils/asyncHandler';

// Financial Module v0.1 (Sprint 4.4B; ADR 0012).
//
// ADMINISTRATIVE module — uses requireRole, NOT requireClinicalRole (ADR 0012 §7.1).
//
// EVERY route here follows the same 4-stage pipeline:
//   1. IP-keyed rate limiter BEFORE auth (un-authenticated floods throttled at
//      the edge without ever touching the DB).
//      - GETs (list/detail/summary/listForPatient) reuse `patientsRateLimit`.
//      - Writes (POST/PATCH/mark-paid/cancel) reuse `importRateLimit`.
//   2. `requireAuth` (Bearer JWT).
//   3. `requireClinic` (DB-checked since Sprint 3.25 — deactivated members
//      cannot reach financial endpoints even with a valid JWT; admin_sistema
//      is blocked here with no_clinic_context).
//   4. `requireRole(['dono_clinica','secretaria'])` — broad administrative
//      gate. Fine-grained policy (profissional_clinico blocked entirely,
//      gestor_clinica downgraded to view+transact) lives in the SERVICE which
//      consults `user_clinical_roles` once per request.
//
// ADR 0012 §7.3 / smoke-user matrix:
//   - smoke.owner       (papel=dono_clinica)                 → full access
//   - smoke.secretaria  (papel=secretaria, no grants)        → full access
//   - smoke.gestor      (papel=secretaria + gestor_clinica)  → view+transact
//   - smoke.profissional(papel=secretaria + profissional_*)  → 403 in service
//   - smoke.admin       (papel=admin_sistema)                → 403 no_clinic_context
const financialAdminAllowlist = ['dono_clinica', 'secretaria'] as const;

export const financialChargesRouter = Router();

// POST /financial/charges — create pending charge.
financialChargesRouter.post(
  '/financial/charges',
  importRateLimit,
  requireAuth,
  requireClinic,
  requireRole(financialAdminAllowlist),
  asyncHandler(financialChargeController.create),
);

// GET /financial/charges — list with filters.
financialChargesRouter.get(
  '/financial/charges',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(financialAdminAllowlist),
  asyncHandler(financialChargeController.list),
);

// GET /financial/summary — totalizadores. Defined BEFORE /financial/charges/:id
// so Express doesn't match "/summary" as an :id parameter.
financialChargesRouter.get(
  '/financial/summary',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(financialAdminAllowlist),
  asyncHandler(financialChargeController.summary),
);

// GET /financial/charges/:id — detail (includes notes).
financialChargesRouter.get(
  '/financial/charges/:id',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(financialAdminAllowlist),
  asyncHandler(financialChargeController.detail),
);

// PATCH /financial/charges/:id — update pending charge.
financialChargesRouter.patch(
  '/financial/charges/:id',
  importRateLimit,
  requireAuth,
  requireClinic,
  requireRole(financialAdminAllowlist),
  asyncHandler(financialChargeController.update),
);

// POST /financial/charges/:id/mark-paid — pending → paid.
financialChargesRouter.post(
  '/financial/charges/:id/mark-paid',
  importRateLimit,
  requireAuth,
  requireClinic,
  requireRole(financialAdminAllowlist),
  asyncHandler(financialChargeController.markPaid),
);

// POST /financial/charges/:id/cancel — pending → canceled.
financialChargesRouter.post(
  '/financial/charges/:id/cancel',
  importRateLimit,
  requireAuth,
  requireClinic,
  requireRole(financialAdminAllowlist),
  asyncHandler(financialChargeController.cancel),
);

// GET /patients/:id/charges — single-patient list. Lives in this router
// because the semantics belong to the financial module (mirrors
// GET /patients/:id/documents in routes/clinicalDocuments.ts).
financialChargesRouter.get(
  '/patients/:id/charges',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(financialAdminAllowlist),
  asyncHandler(financialChargeController.listForPatient),
);
