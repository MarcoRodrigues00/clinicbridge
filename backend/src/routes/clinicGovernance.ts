import { Router } from 'express';
import { clinicGovernanceController } from '../controllers/clinicGovernanceController';
import {
  CLINIC_ADMIN_ROLES,
  requireAuth,
  requireClinic,
  requireRole,
} from '../middlewares/requireAuth';
import { patientsRateLimit } from '../middlewares/rateLimit';
import { asyncHandler } from '../utils/asyncHandler';

// Clinic Governance v0.1 — Sprint 6.1A (ADR 0019).
//
// GOVERNANCE axis only (Titular / Administrador). Administrative endpoints —
// NO clinical content, NO billing. Pipeline:
//   1. patientsRateLimit (IP-keyed, before auth).
//   2. requireAuth (Bearer JWT).
//   3. requireClinic (DB-checked; admin_sistema → no_clinic_context;
//      deactivated members blocked).
//   4. requireRole(CLINIC_ADMIN_ROLES) — dono_clinica (= the backfilled
//      titular). The write path ALSO enforces titular-only in the service
//      (assertClinicTitular), so the governance DB row is the real gate.
//
// This sprint is FOUNDATION ONLY: there is no revoke / transfer-titularity /
// delete-clinic / cancel-subscription endpoint. Promoting to `administrador`
// grants NO clinical access and NO actual power yet (enforcement lands in a
// future sprint) — it only records governance + audit.
export const clinicGovernanceRouter = Router();

clinicGovernanceRouter.get(
  '/clinic-governance',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(clinicGovernanceController.list),
);

clinicGovernanceRouter.post(
  '/clinic-governance/admins',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(clinicGovernanceController.promoteAdministrator),
);
