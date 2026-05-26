import { Router } from 'express';
import { clinicalEncounterController } from '../controllers/clinicalEncounterController';
import { requireAuth, requireClinic } from '../middlewares/requireAuth';
import { requireClinicalRole } from '../middlewares/requireClinicalRole';
import { importRateLimit, patientsRateLimit } from '../middlewares/rateLimit';
import { asyncHandler } from '../utils/asyncHandler';

// Prontuário/Atendimento clínico v0.1 (Sprint 4.2B-3; ADR 0010 §11).
//
// EVERY route here:
//   1. Runs the IP-keyed rate limiter BEFORE auth, so a flood of unauthenticated
//      requests is throttled at the edge without ever touching the DB.
//      - GETs (list/detail/timeline) reuse `patientsRateLimit` per ADR 0010 §12.
//      - Writes (POST/PATCH) reuse `importRateLimit` — write-heavy endpoints
//        share the existing write-class limiter; a dedicated CLINICAL_WRITE_*
//        limiter would require an env addition outside this sprint's scope.
//   2. Requires authentication (`requireAuth`).
//   3. Requires tenant membership (`requireClinic` — DB-checked since Sprint
//      3.25, so a deactivated member's old JWT cannot reach clinical content).
//   4. Requires a clinical role (`requireClinicalRole`) — the allowlist is
//      operation-specific and decides whether dono_clinica passes implicitly.
//
// Role gates per route (ADR 0010 §11 + §7 matrix):
//   - create/cancel/createNote → ['profissional_clinico'] only. Owner needs
//     the explicit grant too (ADR 0010 §7 row 1).
//   - list/detail/timeline      → ['profissional_clinico', 'gestor_clinica']
//     plus dono_clinica implicit (gestor_clinica is in the allowlist).
//
// `internal_note` redaction, "professional sees only its own", strict-mode
// clinical-read audit and 404-on-mismatch live in the service/DAO; defense
// in depth keeps them OUT of this routing module.
export const clinicalEncountersRouter = Router();

// POST /clinical/encounters — create encounter (+ optional initial note).
clinicalEncountersRouter.post(
  '/clinical/encounters',
  importRateLimit,
  requireAuth,
  requireClinic,
  requireClinicalRole(['profissional_clinico']),
  asyncHandler(clinicalEncounterController.create),
);

// GET /clinical/encounters — METADATA-LIST (no clinical text, no notes).
clinicalEncountersRouter.get(
  '/clinical/encounters',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireClinicalRole(['profissional_clinico', 'gestor_clinica']),
  asyncHandler(clinicalEncounterController.list),
);

// GET /clinical/encounters/:id — CONTENT-READ (encounter + redacted notes).
clinicalEncountersRouter.get(
  '/clinical/encounters/:id',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireClinicalRole(['profissional_clinico', 'gestor_clinica']),
  asyncHandler(clinicalEncounterController.detail),
);

// PATCH /clinical/encounters/:id/cancel — author cancels their own (CAS).
clinicalEncountersRouter.patch(
  '/clinical/encounters/:id/cancel',
  importRateLimit,
  requireAuth,
  requireClinic,
  requireClinicalRole(['profissional_clinico']),
  asyncHandler(clinicalEncounterController.cancel),
);

// POST /clinical/encounters/:id/notes — author adds a note or rectifies one.
clinicalEncountersRouter.post(
  '/clinical/encounters/:id/notes',
  importRateLimit,
  requireAuth,
  requireClinic,
  requireClinicalRole(['profissional_clinico']),
  asyncHandler(clinicalEncounterController.createNote),
);

// GET /patients/:id/clinical-timeline — TIMELINE-METADATA (no clinical text).
// Lives in this router because its semantics belong to the clinical module;
// the URL path follows REST conventions for patient sub-resources (matches
// ADR 0010 §11.6).
clinicalEncountersRouter.get(
  '/patients/:id/clinical-timeline',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireClinicalRole(['profissional_clinico', 'gestor_clinica']),
  asyncHandler(clinicalEncounterController.timeline),
);
