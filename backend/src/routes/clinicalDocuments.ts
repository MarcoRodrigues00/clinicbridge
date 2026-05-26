import { Router } from 'express';
import { clinicalDocumentController } from '../controllers/clinicalDocumentController';
import { requireAuth, requireClinic } from '../middlewares/requireAuth';
import { requireClinicalRole } from '../middlewares/requireClinicalRole';
import { importRateLimit, patientsRateLimit } from '../middlewares/rateLimit';
import { asyncHandler } from '../utils/asyncHandler';

// Documentos Médicos v0.1 (Sprint 4.3B; ADR 0011 §14).
//
// EVERY route here follows the same 4-stage pipeline:
//   1. IP-keyed rate limiter BEFORE auth (un-authenticated floods throttled at
//      the edge without ever touching the DB).
//      - GETs (list/detail/listForPatient/pdf) reuse `patientsRateLimit`.
//      - Writes (POST/PATCH) reuse `importRateLimit` — write-heavy endpoints
//        share the existing write-class limiter; a dedicated CLINICAL_WRITE_*
//        limiter would require an env addition outside this sprint's scope
//        (consistent with Sprint 4.2B-3 decision for /clinical/encounters).
//   2. `requireAuth` (Bearer JWT).
//   3. `requireClinic` (DB-checked since Sprint 3.25 — deactivated members
//      cannot reach clinical content even with a valid JWT).
//   4. `requireClinicalRole` (operation-specific allowlist; decides whether
//      dono_clinica passes implicitly).
//
// Role gates per route (ADR 0011 §7):
//   - create/update/finalize/cancel    → ['profissional_clinico'] only.
//                                        Owner alone (without the grant) is
//                                        rejected — ADR 0011 §6.2 + §7 note.
//   - list/detail/listForPatient/pdf   → ['profissional_clinico', 'gestor_clinica']
//                                        plus dono_clinica implicit (gestor_clinica
//                                        is in the allowlist).
//
// All anti-enumeration, "professional sees only its own", strict-mode audit
// and 404-on-mismatch logic lives in the service/DAO. The route layer only
// composes middleware.
export const clinicalDocumentsRouter = Router();

// POST /clinical/documents — create draft.
clinicalDocumentsRouter.post(
  '/clinical/documents',
  importRateLimit,
  requireAuth,
  requireClinic,
  requireClinicalRole(['profissional_clinico']),
  asyncHandler(clinicalDocumentController.create),
);

// GET /clinical/documents — METADATA-LIST (no body/metadata_json/cancel_reason_text).
clinicalDocumentsRouter.get(
  '/clinical/documents',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireClinicalRole(['profissional_clinico', 'gestor_clinica']),
  asyncHandler(clinicalDocumentController.list),
);

// GET /clinical/documents/:id — CONTENT-READ (body + metadata_json).
// Strict-mode audit fires BEFORE serialization.
clinicalDocumentsRouter.get(
  '/clinical/documents/:id',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireClinicalRole(['profissional_clinico', 'gestor_clinica']),
  asyncHandler(clinicalDocumentController.detail),
);

// PATCH /clinical/documents/:id — update draft (author + draft only).
clinicalDocumentsRouter.patch(
  '/clinical/documents/:id',
  importRateLimit,
  requireAuth,
  requireClinic,
  requireClinicalRole(['profissional_clinico']),
  asyncHandler(clinicalDocumentController.update),
);

// POST /clinical/documents/:id/finalize — finalize draft (author).
clinicalDocumentsRouter.post(
  '/clinical/documents/:id/finalize',
  importRateLimit,
  requireAuth,
  requireClinic,
  requireClinicalRole(['profissional_clinico']),
  asyncHandler(clinicalDocumentController.finalize),
);

// POST /clinical/documents/:id/cancel — cancel draft or finalized (author).
clinicalDocumentsRouter.post(
  '/clinical/documents/:id/cancel',
  importRateLimit,
  requireAuth,
  requireClinic,
  requireClinicalRole(['profissional_clinico']),
  asyncHandler(clinicalDocumentController.cancel),
);

// GET /clinical/documents/:id/pdf — on-demand PDF download.
// Strict-mode PDF-download audit fires BEFORE the PDF is generated.
clinicalDocumentsRouter.get(
  '/clinical/documents/:id/pdf',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireClinicalRole(['profissional_clinico', 'gestor_clinica']),
  asyncHandler(clinicalDocumentController.pdf),
);

// GET /patients/:id/documents — single-patient METADATA-LIST.
// Lives in this router because the semantics belong to the documents module
// (mirrors GET /patients/:id/clinical-timeline in routes/clinicalEncounters.ts).
clinicalDocumentsRouter.get(
  '/patients/:id/documents',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireClinicalRole(['profissional_clinico', 'gestor_clinica']),
  asyncHandler(clinicalDocumentController.listForPatient),
);
