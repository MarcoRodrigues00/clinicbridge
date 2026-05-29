import { Router } from 'express';
import { appointmentController } from '../controllers/appointmentController';
import { requireAuth, requireClinic, requireRole } from '../middlewares/requireAuth';
import { patientsRateLimit } from '../middlewares/rateLimit';
import { asyncHandler } from '../utils/asyncHandler';

// Administrative Scheduling — appointments (Sprint 3.14, ADR 0006).
// Administrative data only — NO clinical fields. Always tenant-scoped
// (requireClinic + DAO clinica_id filter). Owner + secretaria may operate the
// agenda. Cancellation is a status; there is intentionally NO DELETE route.
// Reuses the IP-keyed patientsRateLimit (runs before auth).
export const appointmentsRouter = Router();

// Operational allowlist (Sprint 6.0M hardening). Both staff papéis operate the
// agenda (reads + writes), so the allowlist is broad — but we add the explicit
// requireRole layer that the other administrative modules already have, for
// defense-in-depth and consistency. requireClinic already blocks admin_sistema
// (no clinica_id) and deactivated members; this does not change behavior for any
// papel that can legitimately reach a clinic.
const appointmentsAllowlist = ['dono_clinica', 'secretaria'] as const;

appointmentsRouter.get(
  '/appointments',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(appointmentsAllowlist),
  asyncHandler(appointmentController.list),
);

appointmentsRouter.post(
  '/appointments',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(appointmentsAllowlist),
  asyncHandler(appointmentController.create),
);

appointmentsRouter.get(
  '/appointments/:id',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(appointmentsAllowlist),
  asyncHandler(appointmentController.detail),
);

appointmentsRouter.patch(
  '/appointments/:id/status',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(appointmentsAllowlist),
  asyncHandler(appointmentController.updateStatus),
);

appointmentsRouter.patch(
  '/appointments/:id/reschedule',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(appointmentsAllowlist),
  asyncHandler(appointmentController.reschedule),
);
