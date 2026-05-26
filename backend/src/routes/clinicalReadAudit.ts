import { Router } from 'express';
import { clinicalReadAuditController } from '../controllers/clinicalReadAuditController';
import {
  CLINIC_ADMIN_ROLES,
  requireAuth,
  requireClinic,
  requireRole,
} from '../middlewares/requireAuth';
import { patientsRateLimit } from '../middlewares/rateLimit';
import { asyncHandler } from '../utils/asyncHandler';

// LGPD-art.18 transparency endpoint (Sprint 4.2E; ADR 0010 §8.3).
//
// Owner-only — `requireRole(CLINIC_ADMIN_ROLES)` gates this endpoint.
// gestor_clinica / profissional_clinico / secretaria / admin_sistema cannot
// access read-audit metadata (only the owner is responsible for LGPD
// transparency to data subjects).
//
// Pipeline: rate-limit (IP, before auth) → requireAuth → requireClinic
//   (DB-checked membership) → requireRole(dono_clinica).
//
// The response never contains clinical content. ip/user_agent are excluded
// from the payload (stay in the DB for forensics).
export const clinicalReadAuditRouter = Router();

clinicalReadAuditRouter.get(
  '/clinical/read-audit',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(clinicalReadAuditController.list),
);
