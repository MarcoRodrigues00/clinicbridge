import { Router } from 'express';
import { clinicServiceController } from '../controllers/clinicServiceController';
import {
  CLINIC_ADMIN_ROLES,
  requireAuth,
  requireClinic,
  requireRole,
} from '../middlewares/requireAuth';
import { patientsRateLimit } from '../middlewares/rateLimit';
import { asyncHandler } from '../utils/asyncHandler';

// Catálogo de Serviços v0.1 — Sprint 4.6B (ADR 0015).
//
// ADMINISTRATIVE/COMMERCIAL module — uses requireRole, NOT requireClinicalRole.
//
// Pipeline:
//   1. patientsRateLimit BEFORE auth (mirrors clinic-professionals; same
//      shape as financial GETs).
//   2. requireAuth (Bearer JWT).
//   3. requireClinic (DB-checked; deactivated users / admin_sistema blocked).
//   4. requireRole on EVERY route:
//      - READS: ['dono_clinica','secretaria'] — the selector in the agenda
//        is consumed by both papers (profissional_clinico, whose papel is
//        'secretaria' plus a clinical grant, passes here; this is intentional
//        per ADR 0015 §2.7).
//      - WRITES: CLINIC_ADMIN_ROLES = ['dono_clinica'] only — catalog is a
//        pricing-table decision (mirrors clinic-professionals).
//
// Smoke matrix (ADR 0015 §2.7 + testing-checklist):
//   - smoke.owner       (papel=dono_clinica)                 → full CRUD
//   - smoke.secretaria  (papel=secretaria)                   → read only
//   - smoke.gestor      (papel=secretaria + gestor_clinica)  → read only
//   - smoke.profissional(papel=secretaria + profissional_*)  → read only (selector)
//   - smoke.admin       (papel=admin_sistema)                → 403 no_clinic_context
const catalogReadAllowlist = ['dono_clinica', 'secretaria'] as const;

export const clinicServicesRouter = Router();

// GET /clinic-services — list with filters (active, paginação).
clinicServicesRouter.get(
  '/clinic-services',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(catalogReadAllowlist),
  asyncHandler(clinicServiceController.list),
);

// POST /clinic-services — owner only.
clinicServicesRouter.post(
  '/clinic-services',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(clinicServiceController.create),
);

// GET /clinic-services/:id/professionals — read access (selector).
// Defined BEFORE /:id so Express does not absorb "professionals" as :id when
// it is in fact a static segment of a different path.
clinicServicesRouter.get(
  '/clinic-services/:id/professionals',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(catalogReadAllowlist),
  asyncHandler(clinicServiceController.listProfessionals),
);

// POST /clinic-services/:id/professionals — owner only.
clinicServicesRouter.post(
  '/clinic-services/:id/professionals',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(clinicServiceController.linkProfessional),
);

// PATCH /clinic-services/:id/professionals/:professional_id/status — owner only.
clinicServicesRouter.patch(
  '/clinic-services/:id/professionals/:professional_id/status',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(clinicServiceController.updateProfessionalLinkStatus),
);

// PATCH /clinic-services/:id/status — owner only.
// Defined BEFORE /:id so /status is not absorbed as part of :id.
clinicServicesRouter.patch(
  '/clinic-services/:id/status',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(clinicServiceController.updateStatus),
);

// GET /clinic-services/:id — detail.
clinicServicesRouter.get(
  '/clinic-services/:id',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(catalogReadAllowlist),
  asyncHandler(clinicServiceController.detail),
);

// PATCH /clinic-services/:id — owner only.
clinicServicesRouter.patch(
  '/clinic-services/:id',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(clinicServiceController.update),
);
