import { Router } from 'express';
import { patientController } from '../controllers/patientController';
import { CLINIC_ADMIN_ROLES, requireAuth, requireClinic, requireRole } from '../middlewares/requireAuth';
import { exportRateLimit, patientsRateLimit } from '../middlewares/rateLimit';
import { asyncHandler } from '../utils/asyncHandler';

export const patientsRouter = Router();

// Rate limit runs first (IP-keyed, cheap) so floods are rejected before auth /
// DB work, matching the existing upload route ordering.

// Read-only listing of administrative patients (Sprint 2.19). Always
// tenant-scoped via requireClinic + the DAO's clinica_id filter. No create,
// update or delete routes — and no clinical data exists to expose.
patientsRouter.get(
  '/patients',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  asyncHandler(patientController.list),
);

// Read-only duplicate detection (Sprint 2.20). Informational only — it NEVER
// merges, edits or deletes patients. Always tenant-scoped; CPF is masked.
patientsRouter.get(
  '/patients/duplicates',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  asyncHandler(patientController.duplicates),
);

// Read-only export (Sprint 2.21). CSV/XLSX of administrative patients only.
// Tenant-scoped; CPF is masked; formula injection neutralized; never writes.
// Sprint 3.1: export generates a file with administrative PII, so it is gated to
// clinic owners (requireRole after requireClinic — never bypasses tenant check).
patientsRouter.get(
  '/patients/export',
  exportRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(patientController.export),
);
