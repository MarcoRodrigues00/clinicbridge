import type { Request, Response } from 'express';
import { HttpError } from '../middlewares/errorHandler';
import { importValidationService } from '../services/importValidationService';
import { buildAuthContext } from '../utils/authContext';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const importValidationController = {
  async validate(req: Request, res: Response): Promise<void> {
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
    if (!UUID_RE.test(id)) {
      throw new HttpError(404, 'import_file_not_found', 'Arquivo não encontrado.');
    }

    const body = (req.body ?? {}) as { mapping?: unknown };
    const report = await importValidationService.generateReport(
      id,
      body.mapping,
      { clinica_id, usuario_id },
      ctx,
    );
    res.status(200).json(report);
  },
};
