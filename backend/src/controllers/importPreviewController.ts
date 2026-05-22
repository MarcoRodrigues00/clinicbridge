import type { Request, Response } from 'express';
import { HttpError } from '../middlewares/errorHandler';
import { auditPreviewFailure, importPreviewService } from '../services/importPreviewService';
import { buildAuthContext } from '../utils/authContext';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const importPreviewController = {
  async preview(req: Request, res: Response): Promise<void> {
    if (!req.auth) {
      throw new HttpError(401, 'unauthorized', 'Autenticação necessária.');
    }
    if (!req.auth.clinica_id) {
      throw new HttpError(403, 'no_clinic_context', 'Nenhuma clínica associada ao usuário.');
    }
    const clinica_id = req.auth.clinica_id;
    const usuario_id = req.auth.sub;
    const ctx = buildAuthContext(req);

    const id = req.params.id;
    // Reject non-UUID ids with the same generic 404 used for "not found", so the
    // query never reaches the DB with a malformed id and nothing is enumerable.
    if (!UUID_RE.test(id)) {
      await auditPreviewFailure({ usuario_id, clinica_id }, null, ctx);
      throw new HttpError(404, 'import_file_not_found', 'Arquivo não encontrado.');
    }

    const preview = await importPreviewService.generatePreview(id, { clinica_id, usuario_id }, ctx);
    res.status(200).json(preview);
  },
};
