import type { Request, Response } from 'express';
import { HttpError } from '../middlewares/errorHandler';
import type { ClinicalCapability } from '../middlewares/requireClinicalRole';
import { clinicalEncounterService } from '../services/clinicalEncounterService';
import { clinicalEncounterNoteService } from '../services/clinicalEncounterNoteService';
import { buildAuthContext } from '../utils/authContext';

// Builds the actor for clinical-service calls. The route stack guarantees:
//   requireAuth → req.auth populated
//   requireClinic → users.ativo + same clinic enforced (DB check)
//   requireClinicalRole → req.clinicalRoles populated
// This helper re-derives nothing from the HTTP request that the middleware
// stack has not already validated. Defense in depth: if any of the three
// invariants is missing, fail hard (should not happen in practice — the
// route registration in `routes/clinicalEncounters.ts` enforces ordering).
function clinicalActor(req: Request): {
  clinica_id: string;
  usuario_id: string;
  clinicalRoles: Set<ClinicalCapability>;
} {
  if (!req.auth) {
    throw new HttpError(401, 'unauthorized', 'Autenticação necessária.');
  }
  if (!req.auth.clinica_id) {
    throw new HttpError(403, 'no_clinic_context', 'Nenhuma clínica associada ao usuário.');
  }
  if (!req.clinicalRoles) {
    // Should be unreachable — requireClinicalRole sets this on every gated
    // route. Surface a generic 403 rather than a 500 to avoid leaking the
    // middleware ordering bug to the caller.
    throw new HttpError(403, 'forbidden_role', 'Você não tem permissão para acessar dados clínicos.');
  }
  return {
    clinica_id: req.auth.clinica_id,
    usuario_id: req.auth.sub,
    clinicalRoles: req.clinicalRoles,
  };
}

function asObject(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

export const clinicalEncounterController = {
  // POST /clinical/encounters — create an encounter with optional initial note.
  // Role gate: profissional_clinico (owner needs the explicit grant too).
  // Response shape carries metadata + cancel_reason_text (PublicClinicalEncounter)
  // and the id of the initial note (no note content round-trips here — the
  // client may re-fetch via GET /clinical/encounters/:id if needed).
  async create(req: Request, res: Response): Promise<void> {
    const actor = clinicalActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await clinicalEncounterService.create(
      actor,
      {
        patient_id: body.patient_id,
        appointment_id: body.appointment_id,
        professional_id: body.professional_id,
        started_at: body.started_at,
        ended_at: body.ended_at,
        initial_note: body.initial_note,
      },
      ctx,
    );
    res.status(201).json(result);
  },

  // GET /clinical/encounters — METADATA-LIST. Returns
  // PublicClinicalEncounterListItem[] — NEVER the 5 textual fields, NEVER
  // cancel_reason_text, NEVER notes. The metadata-list audit
  // (`clinical.encounter.list`) fires in the service BEFORE the SELECT;
  // strict-mode failure aborts before any row is returned.
  async list(req: Request, res: Response): Promise<void> {
    const actor = clinicalActor(req);
    const ctx = buildAuthContext(req);
    const result = await clinicalEncounterService.list(
      actor,
      {
        patient_id: req.query.patient_id,
        professional_id: req.query.professional_id,
        attending_user_id: req.query.attending_user_id,
        status: req.query.status,
        from: req.query.from,
        to: req.query.to,
        limit: req.query.limit,
      },
      ctx,
    );
    res.status(200).json(result);
  },

  // GET /clinical/encounters/:id — CONTENT-READ. Returns the encounter +
  // its notes. internal_note is redacted by the service for non-author
  // readers. The content-read audit (`clinical.encounter.read`) carries
  // paciente_id and is emitted BEFORE the notes are loaded — strict-mode
  // failure aborts before any clinical text leaves the server.
  async detail(req: Request, res: Response): Promise<void> {
    const actor = clinicalActor(req);
    const ctx = buildAuthContext(req);
    const result = await clinicalEncounterService.findById(actor, req.params.id, ctx);
    res.status(200).json(result);
  },

  // PATCH /clinical/encounters/:id/cancel — author cancels their own
  // encounter. The DAO CAS enforces (id, clinica_id, attending=self,
  // status='active'); a CAS miss surfaces a generic 404 (anti-enumeration
  // of "belongs to another clinician" vs "already canceled").
  async cancel(req: Request, res: Response): Promise<void> {
    const actor = clinicalActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const encounter = await clinicalEncounterService.cancel(
      actor,
      req.params.id,
      { reason_code: body.reason_code, reason_text: body.reason_text },
      ctx,
    );
    res.status(200).json({ encounter });
  },

  // POST /clinical/encounters/:id/notes — author adds a note (or rectifies
  // an existing one via revises_note_id + rectification_reason_code). The
  // service validates encounter ownership, at-least-one-textual-field, length
  // caps, and the rectification chain rules (same encounter, same author).
  async createNote(req: Request, res: Response): Promise<void> {
    const actor = clinicalActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const note = await clinicalEncounterNoteService.create(
      actor,
      req.params.id,
      {
        chief_complaint: body.chief_complaint,
        anamnesis: body.anamnesis,
        evolution: body.evolution,
        plan: body.plan,
        internal_note: body.internal_note,
        revises_note_id: body.revises_note_id,
        rectification_reason_code: body.rectification_reason_code,
      },
      ctx,
    );
    res.status(201).json({ note });
  },

  // GET /patients/:id/clinical-timeline — TIMELINE-METADATA single-patient.
  // Returns PublicClinicalEncounterListItem[] — NEVER textual fields, NEVER
  // notes. Audit (`clinical.timeline.list`) carries paciente_id because
  // the read singles out one patient; still does NOT substitute for a
  // content-read audit (the client must open the detail view for that).
  async timeline(req: Request, res: Response): Promise<void> {
    const actor = clinicalActor(req);
    const ctx = buildAuthContext(req);
    const result = await clinicalEncounterService.listForPatient(
      actor,
      req.params.id,
      { limit: req.query.limit },
      ctx,
    );
    res.status(200).json(result);
  },
};
