import { Router } from 'express';
import { clinicServiceController } from '../controllers/clinicServiceController';
import {
  requireAuth,
  requireClinic,
  requireRole,
} from '../middlewares/requireAuth';
import { requireClinicGovernance } from '../middlewares/requireClinicGovernance';
import { patientsRateLimit } from '../middlewares/rateLimit';
import { asyncHandler } from '../utils/asyncHandler';

// Catálogo de Serviços v0.1 — Sprint 4.6B (ADR 0015) · governança 6.1B (ADR 0019).
//
// ADMINISTRATIVE/COMMERCIAL module.
//
// Pipeline:
//   1. patientsRateLimit BEFORE auth (mirrors clinic-professionals; same
//      shape as financial GETs).
//   2. requireAuth (Bearer JWT).
//   3. requireClinic (DB-checked; deactivated users / admin_sistema blocked).
//   4. authorization:
//      - READS: requireRole(['dono_clinica','secretaria']) — UNCHANGED. The
//        agenda selector is consumed by both papers (profissional_clinico,
//        whose papel is 'secretaria' plus a clinical grant, passes here;
//        intentional per ADR 0015 §2.7).
//      - WRITES: requireClinicGovernance(['titular','administrador']) — Sprint
//        6.1B (ADR 0019). FIRST module to enforce the governance axis. Was
//        owner-only (CLINIC_ADMIN_ROLES); now the Titular AND promoted
//        Administradores can mutate the catalog. This is ADDITIVE: secretaria
//        never had catalog write (still doesn't), so no existing flow breaks;
//        a legacy `dono_clinica` without a governance row is treated as titular
//        by the middleware. Being an Administrador grants NO clinical access
//        and NO billing power.
//
// Smoke matrix (governança 6.1B):
//   - smoke.owner       (papel=dono_clinica / titular)        → full CRUD
//   - administrador     (promoted via /clinic-governance)     → full CRUD
//   - smoke.secretaria  (papel=secretaria, sem governança)    → read only (403 write)
//   - smoke.gestor      (papel=secretaria + gestor_clinica)   → read only (403 write)
//   - smoke.profissional(papel=secretaria + profissional_*)   → read only (selector)
//   - smoke.admin       (papel=admin_sistema)                 → 403 no_clinic_context
const catalogReadAllowlist = ['dono_clinica', 'secretaria'] as const;
const catalogWriteGovernance = ['titular', 'administrador'] as const;

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
  requireClinicGovernance(catalogWriteGovernance),
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
  requireClinicGovernance(catalogWriteGovernance),
  asyncHandler(clinicServiceController.linkProfessional),
);

// PATCH /clinic-services/:id/professionals/:professional_id/status — owner only.
clinicServicesRouter.patch(
  '/clinic-services/:id/professionals/:professional_id/status',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireClinicGovernance(catalogWriteGovernance),
  asyncHandler(clinicServiceController.updateProfessionalLinkStatus),
);

// PATCH /clinic-services/:id/status — owner only.
// Defined BEFORE /:id so /status is not absorbed as part of :id.
clinicServicesRouter.patch(
  '/clinic-services/:id/status',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireClinicGovernance(catalogWriteGovernance),
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
  requireClinicGovernance(catalogWriteGovernance),
  asyncHandler(clinicServiceController.update),
);
