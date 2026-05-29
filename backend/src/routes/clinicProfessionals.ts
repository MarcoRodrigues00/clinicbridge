import { Router } from 'express';
import { clinicProfessionalController } from '../controllers/clinicProfessionalController';
import {
  CLINIC_ADMIN_ROLES,
  requireAuth,
  requireClinic,
  requireRole,
} from '../middlewares/requireAuth';
import { patientsRateLimit } from '../middlewares/rateLimit';
import { asyncHandler } from '../utils/asyncHandler';

// Administrative Scheduling — clinic professionals (Sprint 3.14, ADR 0006).
// Administrative data only (name + optional administrative label). Always
// tenant-scoped (requireClinic + DAO clinica_id filter). Reuses the generous,
// IP-keyed patientsRateLimit (runs before auth, like the other read routes).
// Owner-only writes; reads allowed for owner + secretaria.
export const clinicProfessionalsRouter = Router();

// Read allowlist (Sprint 6.0M hardening). The agenda professional list is
// non-PII administrative data consumed by Agenda and Serviços, so reads stay
// open to the whole operational staff (dono + secretaria) — but we add the
// explicit requireRole layer that every other administrative read already has,
// for defense-in-depth and consistency. requireClinic already blocks
// admin_sistema (no clinica_id) and deactivated members; this never narrows the
// agenda flow for legitimate users (gestor/profissional grants ride on
// papel=secretaria and remain allowed).
const scheduleReadAllowlist = ['dono_clinica', 'secretaria'] as const;

clinicProfessionalsRouter.get(
  '/clinic-professionals',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(scheduleReadAllowlist),
  asyncHandler(clinicProfessionalController.list),
);

clinicProfessionalsRouter.post(
  '/clinic-professionals',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(clinicProfessionalController.create),
);

clinicProfessionalsRouter.patch(
  '/clinic-professionals/:id',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(clinicProfessionalController.update),
);

clinicProfessionalsRouter.patch(
  '/clinic-professionals/:id/deactivate',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(clinicProfessionalController.deactivate),
);
