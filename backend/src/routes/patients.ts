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

// Manual administrative CRUD (Sprint 3.22). Administrative fields ONLY — no
// clinical data. All writes are tenant-scoped (requireClinic + DAO clinica_id
// filter); a cross-clinic id yields a generic 404. There is NO physical delete:
// archiving sets status='archived' (kept out of the default listing and the
// agenda picker), restoring sets it back to 'active'.

// Create + edit: owner + secretaria (no requireRole — both operate the records).
patientsRouter.post(
  '/patients',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  asyncHandler(patientController.create),
);

patientsRouter.patch(
  '/patients/:id',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  asyncHandler(patientController.update),
);

// Archive + restore: owner-only (requireRole after requireClinic — never
// bypasses tenant isolation), mirroring the other sensitive admin actions.
patientsRouter.patch(
  '/patients/:id/archive',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(patientController.archive),
);

patientsRouter.patch(
  '/patients/:id/restore',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(patientController.restore),
);

// Safe duplicate merge B-safe (Sprint 3.33; ADR 0007). Owner-only — same gate
// as archive/restore (requireRole after requireClinic never bypasses tenant
// isolation). In a single transaction: fill-blanks the primary, reassign the
// secondaries' appointments to the primary, and archive each secondary with
// provenance. No physical delete; no clinical data touched.
patientsRouter.post(
  '/patients/:id/merge',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(patientController.merge),
);
