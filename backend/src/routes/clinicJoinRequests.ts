import { Router } from 'express';
import { clinicJoinRequestController } from '../controllers/clinicJoinRequestController';
import {
  CLINIC_ADMIN_ROLES,
  requireAuth,
  requireClinic,
  requireRole,
} from '../middlewares/requireAuth';
import { patientsRateLimit } from '../middlewares/rateLimit';
import { asyncHandler } from '../utils/asyncHandler';

// Team management — clinic join requests (Sprint 3.24). Administrative only.
// Reuses the IP-keyed patientsRateLimit (runs before auth). There is NO clinic
// search/listing endpoint — a secretaria joins by an invite code the owner shares.
export const clinicJoinRequestsRouter = Router();

// --- Owner: read own clinic's invite code (to share) -----------------------
clinicJoinRequestsRouter.get(
  '/clinics/invite-code',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(clinicJoinRequestController.inviteCode),
);

// --- Requester (secretaria without a clinic): requireAuth only -------------
clinicJoinRequestsRouter.post(
  '/clinic-join-requests',
  patientsRateLimit,
  requireAuth,
  asyncHandler(clinicJoinRequestController.create),
);

clinicJoinRequestsRouter.get(
  '/clinic-join-requests/me',
  patientsRateLimit,
  requireAuth,
  asyncHandler(clinicJoinRequestController.listMine),
);

clinicJoinRequestsRouter.patch(
  '/clinic-join-requests/:id/cancel',
  patientsRateLimit,
  requireAuth,
  asyncHandler(clinicJoinRequestController.cancel),
);

// --- Owner: list / approve / reject pending requests for own clinic --------
clinicJoinRequestsRouter.get(
  '/clinic-join-requests/pending',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(clinicJoinRequestController.listPending),
);

clinicJoinRequestsRouter.post(
  '/clinic-join-requests/:id/approve',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(clinicJoinRequestController.approve),
);

clinicJoinRequestsRouter.post(
  '/clinic-join-requests/:id/reject',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(clinicJoinRequestController.reject),
);
