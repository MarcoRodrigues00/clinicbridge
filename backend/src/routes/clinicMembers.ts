import { Router } from 'express';
import { clinicMemberController } from '../controllers/clinicMemberController';
import {
  CLINIC_ADMIN_ROLES,
  requireAuth,
  requireClinic,
  requireRole,
} from '../middlewares/requireAuth';
import { patientsRateLimit } from '../middlewares/rateLimit';
import { asyncHandler } from '../utils/asyncHandler';

// Team member management (Sprint 3.25). All routes are owner-only at the role
// level AND tenant-scoped at the data level: services filter by clinica_id and
// return generic 404 cross-tenant. Reuses the IP-keyed patientsRateLimit.
export const clinicMembersRouter = Router();

clinicMembersRouter.get(
  '/clinic-members',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(clinicMemberController.list),
);

clinicMembersRouter.patch(
  '/clinic-members/:userId/deactivate',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(clinicMemberController.deactivate),
);
