import { Router } from 'express';
import { importValidationController } from '../controllers/importValidationController';
import { importRateLimit } from '../middlewares/rateLimit';
import { requireAuth, requireClinic } from '../middlewares/requireAuth';
import { asyncHandler } from '../utils/asyncHandler';

export const importValidationRouter = Router();

// Full-file validation report (read-only): scoped to the caller's clinic. Does
// not import data or persist the mapping. Rate limited (re-parses the file).
importValidationRouter.post(
  '/import-files/:id/validate',
  importRateLimit,
  requireAuth,
  requireClinic,
  asyncHandler(importValidationController.validate),
);
