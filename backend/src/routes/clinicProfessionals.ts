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

clinicProfessionalsRouter.get(
  '/clinic-professionals',
  patientsRateLimit,
  requireAuth,
  requireClinic,
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
