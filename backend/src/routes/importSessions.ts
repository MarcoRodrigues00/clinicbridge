import { Router } from 'express';
import { importSessionController } from '../controllers/importSessionController';
import { importRateLimit } from '../middlewares/rateLimit';
import { CLINIC_ADMIN_ROLES, requireAuth, requireClinic, requireRole } from '../middlewares/requireAuth';
import { asyncHandler } from '../utils/asyncHandler';

export const importSessionsRouter = Router();

// Migration review sessions — all tenant-scoped. Creating one re-runs the
// full-file validation on the backend; it does NOT import any patient data.
importSessionsRouter.post(
  '/import-sessions',
  importRateLimit,
  requireAuth,
  requireClinic,
  asyncHandler(importSessionController.create),
);

importSessionsRouter.get(
  '/import-sessions',
  requireAuth,
  requireClinic,
  asyncHandler(importSessionController.list),
);

importSessionsRouter.get(
  '/import-sessions/:id',
  requireAuth,
  requireClinic,
  asyncHandler(importSessionController.get),
);

// Dry-run: simulates the import (re-parses the file via the saved mapping) and
// returns counts + a safe sample. It NEVER inserts into patients.
importSessionsRouter.post(
  '/import-sessions/:id/dry-run',
  importRateLimit,
  requireAuth,
  requireClinic,
  asyncHandler(importSessionController.dryRun),
);

// Marks a validated review as ready_for_import. Backend re-runs the dry-run
// and refuses to advance if any row is blocked. STILL no patient insertion.
// Sprint 3.1: preparing a review for real import is gated to clinic owners.
importSessionsRouter.post(
  '/import-sessions/:id/mark-ready',
  importRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(importSessionController.markReady),
);

// Real import (Sprint 2.16). Only works on ready_for_import. Re-runs the
// dry-run, refuses any blocked rows, respects IMPORT_MAX_ROWS, and inserts
// patients + status flip in a single transaction. Only administrative fields
// — no clinical data is ever written.
// Sprint 3.1: real import creates patient records, so it is gated to clinic
// owners (requireRole after requireClinic — tenant isolation is preserved).
importSessionsRouter.post(
  '/import-sessions/:id/import',
  importRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(importSessionController.executeImport),
);
