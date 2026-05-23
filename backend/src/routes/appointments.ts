import { Router } from 'express';
import { appointmentController } from '../controllers/appointmentController';
import { requireAuth, requireClinic } from '../middlewares/requireAuth';
import { patientsRateLimit } from '../middlewares/rateLimit';
import { asyncHandler } from '../utils/asyncHandler';

// Administrative Scheduling — appointments (Sprint 3.14, ADR 0006).
// Administrative data only — NO clinical fields. Always tenant-scoped
// (requireClinic + DAO clinica_id filter). Owner + secretaria may operate the
// agenda. Cancellation is a status; there is intentionally NO DELETE route.
// Reuses the IP-keyed patientsRateLimit (runs before auth).
export const appointmentsRouter = Router();

appointmentsRouter.get(
  '/appointments',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  asyncHandler(appointmentController.list),
);

appointmentsRouter.post(
  '/appointments',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  asyncHandler(appointmentController.create),
);

appointmentsRouter.get(
  '/appointments/:id',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  asyncHandler(appointmentController.detail),
);

appointmentsRouter.patch(
  '/appointments/:id/status',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  asyncHandler(appointmentController.updateStatus),
);

appointmentsRouter.patch(
  '/appointments/:id/reschedule',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  asyncHandler(appointmentController.reschedule),
);
