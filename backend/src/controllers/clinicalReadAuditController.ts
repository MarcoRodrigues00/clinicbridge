import type { Request, Response } from 'express';
import { HttpError } from '../middlewares/errorHandler';
import { clinicalReadAuditListService } from '../services/clinicalReadAuditListService';
import { buildAuthContext } from '../utils/authContext';

function ownerActor(req: Request): { clinica_id: string; usuario_id: string } {
  if (!req.auth) {
    throw new HttpError(401, 'unauthorized', 'Autenticação necessária.');
  }
  if (!req.auth.clinica_id) {
    throw new HttpError(403, 'no_clinic_context', 'Nenhuma clínica associada ao usuário.');
  }
  return { clinica_id: req.auth.clinica_id, usuario_id: req.auth.sub };
}

export const clinicalReadAuditController = {
  // GET /clinical/read-audit — owner-only LGPD-art.18 transparency endpoint
  // (Sprint 4.2E). Returns clinical_read_audit metadata for the owner's clinic.
  // NEVER returns clinical content (the table does not store any).
  // ip/user_agent are intentionally excluded from the response (forensic
  // metadata; present in the DB for incident investigation only).
  async list(req: Request, res: Response): Promise<void> {
    const actor = ownerActor(req);
    const ctx = buildAuthContext(req);
    const result = await clinicalReadAuditListService.list(
      actor,
      {
        patient_id: req.query.patient_id,
        user_id: req.query.user_id,
        acao: req.query.acao,
        date_from: req.query.date_from,
        date_to: req.query.date_to,
        limit: req.query.limit,
        offset: req.query.offset,
      },
      ctx,
    );
    res.status(200).json(result);
  },
};
