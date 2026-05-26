import type { Request, Response } from 'express';
import { HttpError } from '../middlewares/errorHandler';
import type { ClinicalCapability } from '../middlewares/requireClinicalRole';
import { clinicalDocumentService } from '../services/clinicalDocumentService';
import { clinicalDocumentPdfService } from '../services/clinicalDocumentPdfService';
import { buildAuthContext } from '../utils/authContext';

// Builds the actor for clinical-document service calls. The route stack
// guarantees:
//   requireAuth → req.auth populated
//   requireClinic → users.ativo + same clinic enforced (DB check)
//   requireClinicalRole → req.clinicalRoles populated
// Defense in depth: if any of the three invariants is missing, fail hard.
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
    throw new HttpError(
      403,
      'forbidden_role',
      'Você não tem permissão para acessar dados clínicos.',
    );
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

export const clinicalDocumentController = {
  // POST /clinical/documents — create draft. ADR 0011 §14.1.
  async create(req: Request, res: Response): Promise<void> {
    const actor = clinicalActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await clinicalDocumentService.create(
      actor,
      {
        patient_id: body.patient_id,
        encounter_id: body.encounter_id,
        doc_type: body.doc_type,
        title: body.title,
        body: body.body,
        metadata_json: body.metadata_json,
        supersedes_document_id: body.supersedes_document_id,
      },
      ctx,
    );
    res.status(201).json(result);
  },

  // GET /clinical/documents — METADATA-LIST. ADR 0011 §14.2.
  // Response carries metadata only: no body, no metadata_json, no cancel_reason_text.
  async list(req: Request, res: Response): Promise<void> {
    const actor = clinicalActor(req);
    const ctx = buildAuthContext(req);
    const result = await clinicalDocumentService.list(
      actor,
      {
        patient_id: req.query.patient_id,
        doc_type: req.query.doc_type,
        status: req.query.status,
        author_user_id: req.query.author_user_id,
        from: req.query.from,
        to: req.query.to,
        limit: req.query.limit,
        offset: req.query.offset,
      },
      ctx,
    );
    res.status(200).json(result);
  },

  // GET /clinical/documents/:id — CONTENT-READ. ADR 0011 §14.3.
  // Strict-mode read audit fires BEFORE serialization; on strict-mode audit
  // failure, no clinical content leaves the server.
  async detail(req: Request, res: Response): Promise<void> {
    const actor = clinicalActor(req);
    const ctx = buildAuthContext(req);
    const result = await clinicalDocumentService.findById(actor, req.params.id, ctx);
    res.status(200).json(result);
  },

  // PATCH /clinical/documents/:id — update draft. ADR 0011 §14.4.
  // Author-only + status='draft' enforced by service + DAO CAS.
  async update(req: Request, res: Response): Promise<void> {
    const actor = clinicalActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await clinicalDocumentService.updateDraft(
      actor,
      req.params.id,
      {
        title: body.title,
        body: body.body,
        metadata_json: body.metadata_json,
        encounter_id: body.encounter_id,
      },
      ctx,
    );
    res.status(200).json(result);
  },

  // POST /clinical/documents/:id/finalize — finalize draft. ADR 0011 §14.5.
  async finalize(req: Request, res: Response): Promise<void> {
    const actor = clinicalActor(req);
    const ctx = buildAuthContext(req);
    const result = await clinicalDocumentService.finalize(actor, req.params.id, ctx);
    res.status(200).json(result);
  },

  // POST /clinical/documents/:id/cancel — cancel draft or finalized. ADR 0011 §14.6.
  async cancel(req: Request, res: Response): Promise<void> {
    const actor = clinicalActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await clinicalDocumentService.cancel(
      actor,
      req.params.id,
      { reason_code: body.reason_code, reason_text: body.reason_text },
      ctx,
    );
    res.status(200).json(result);
  },

  // GET /clinical/documents/:id/pdf — on-demand PDF download. ADR 0011 §14.7.
  //
  // The service: (a) verifies the document is finalized, (b) emits the
  // PDF-download audit in STRICT mode BEFORE generating. If either fails,
  // the controller never reaches the PDF builder and no bytes are written
  // to the response.
  //
  // STREAMING: pdfkit emits bytes incrementally; the response is piped
  // directly. We set headers BEFORE piping, so a stream error after the
  // first byte still preserves the right Content-Type (the response is
  // already committed; the connection will simply drop). The fallback for
  // an error BEFORE the first byte is the global errorHandler.
  async pdf(req: Request, res: Response): Promise<void> {
    const actor = clinicalActor(req);
    const ctx = buildAuthContext(req);
    const { document } = await clinicalDocumentService.getForPdf(
      actor,
      req.params.id,
      ctx,
    );

    const { stream, filename } = await clinicalDocumentPdfService.build({ document });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // Cache-Control: hard no-store — clinical content; never cache at any tier.
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.status(200);

    // Pipe pdfkit's PDFDocument stream into the response. pdfkit will emit
    // 'end' after doc.end() (already called by the service). Errors propagate
    // — if pdfkit throws after first byte, the connection drops with no
    // additional headers; if it throws BEFORE first byte, the global handler
    // sends the JSON error.
    stream.pipe(res);
  },

  // GET /patients/:id/documents — single-patient list. ADR 0011 §14.8.
  async listForPatient(req: Request, res: Response): Promise<void> {
    const actor = clinicalActor(req);
    const ctx = buildAuthContext(req);
    const result = await clinicalDocumentService.listForPatient(
      actor,
      req.params.id,
      { limit: req.query.limit, offset: req.query.offset },
      ctx,
    );
    res.status(200).json(result);
  },
};
