import { Router } from 'express';
import { userClinicalRoleController } from '../controllers/userClinicalRoleController';
import {
  CLINIC_ADMIN_ROLES,
  requireAuth,
  requireClinic,
  requireRole,
} from '../middlewares/requireAuth';
import { importRateLimit, patientsRateLimit } from '../middlewares/rateLimit';
import { asyncHandler } from '../utils/asyncHandler';

// Clinical role administration (Sprint 4.2B-3; ADR 0010 §11.7).
//
// Owner-only endpoints — the gate uses `requireRole(CLINIC_ADMIN_ROLES)`
// (dono_clinica), NOT `requireClinicalRole`. Granting/revoking clinical
// roles is an ADMINISTRATIVE action; the clinical-role middleware exists
// only to gate access to clinical CONTENT, which these endpoints do not
// touch.
//
// Pipeline per route:
//   1. rate limiter (IP-keyed, before auth)
//   2. requireAuth
//   3. requireClinic (DB-checked membership)
//   4. requireRole(CLINIC_ADMIN_ROLES) — owner only
//
// Audit is administrative (`audit_logs`) — `clinical.role.granted.success`
// is best-effort, `clinical.role.revoked.success` is wrapped in the same
// transaction as the CAS revocation so a rollback erases the audit too
// (mirrors the merge B-safe pattern from Sprint 3.33).
export const clinicalRolesRouter = Router();

// GET /clinical/roles — list active grants in the owner's clinic.
clinicalRolesRouter.get(
  '/clinical/roles',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(userClinicalRoleController.listActive),
);

// POST /clinical/roles/grant — grant a clinical role to a clinic member.
clinicalRolesRouter.post(
  '/clinical/roles/grant',
  importRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(userClinicalRoleController.grant),
);

// POST /clinical/roles/revoke — revoke an active grant by id.
clinicalRolesRouter.post(
  '/clinical/roles/revoke',
  importRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(userClinicalRoleController.revoke),
);
