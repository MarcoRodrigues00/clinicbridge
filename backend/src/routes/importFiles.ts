import { Router } from 'express';
import { importFileController } from '../controllers/importFileController';
import { importRateLimit } from '../middlewares/rateLimit';
import { CLINIC_ADMIN_ROLES, requireAuth, requireClinic, requireRole } from '../middlewares/requireAuth';
import { uploadRateLimit } from '../middlewares/uploadRateLimit';
import { uploadSingle } from '../middlewares/uploadMiddleware';
import { asyncHandler } from '../utils/asyncHandler';

export const importFilesRouter = Router();

// Retention DRY-RUN (Sprint 2.24): read-only preview of old-file cleanup
// candidates. Registered before any '/import-files/:id' style route so the
// literal path is never shadowed. Deletes nothing.
// Sprint 3.1: exposes administrative file metadata and is the future basis for
// real cleanup, so it is gated to clinic owners.
importFilesRouter.get(
  '/import-files/retention/dry-run',
  importRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(importFileController.retentionDryRun),
);

// Order matters: rate limit first (cheap, by IP), then auth + tenant checks
// BEFORE multer buffers the body, so unauthenticated or clinic-less callers are
// rejected without us reading their upload at all.
importFilesRouter.post(
  '/import-files/upload',
  uploadRateLimit,
  requireAuth,
  requireClinic,
  uploadSingle,
  asyncHandler(importFileController.upload),
);

importFilesRouter.get(
  '/import-files',
  requireAuth,
  requireClinic,
  asyncHandler(importFileController.list),
);
