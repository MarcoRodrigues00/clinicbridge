import { Router } from 'express';
import { importPreviewController } from '../controllers/importPreviewController';
import { importRateLimit } from '../middlewares/rateLimit';
import { requireAuth, requireClinic } from '../middlewares/requireAuth';
import { asyncHandler } from '../utils/asyncHandler';

export const importPreviewRouter = Router();

// Read-only preview of an already-uploaded file, scoped to the caller's clinic.
// Rate limited (re-parses the file) before auth/DB work.
importPreviewRouter.get(
  '/import-files/:id/preview',
  importRateLimit,
  requireAuth,
  requireClinic,
  asyncHandler(importPreviewController.preview),
);
