import type { Request, Response } from 'express';
import { HttpError } from '../middlewares/errorHandler';
import { patientService } from '../services/patientService';
import { patientDuplicateService } from '../services/patientDuplicateService';
import { patientExportService, type ExportFormat } from '../services/patientExportService';
import { buildAuthContext } from '../utils/authContext';

function parseSearch(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

// requireAuth + requireClinic run before this handler. We re-derive the clinic
// context defensively and refuse with 401/403 rather than trusting ordering.
function clinicContext(req: Request): { clinica_id: string; usuario_id: string } {
  if (!req.auth) {
    throw new HttpError(401, 'unauthorized', 'Autenticação necessária.');
  }
  if (!req.auth.clinica_id) {
    throw new HttpError(403, 'no_clinic_context', 'Nenhuma clínica associada ao usuário.');
  }
  return { clinica_id: req.auth.clinica_id, usuario_id: req.auth.sub };
}

export const patientController = {
  async list(req: Request, res: Response): Promise<void> {
    const actor = clinicContext(req);
    const ctx = buildAuthContext(req);

    const result = await patientService.listForClinic(
      actor,
      {
        search: req.query.search,
        limit: req.query.limit,
        offset: req.query.offset,
      },
      ctx,
    );

    res.status(200).json(result);
  },

  async duplicates(req: Request, res: Response): Promise<void> {
    const actor = clinicContext(req);
    const ctx = buildAuthContext(req);
    const result = await patientDuplicateService.scanForClinic(actor, ctx);
    res.status(200).json(result);
  },

  async export(req: Request, res: Response): Promise<void> {
    const actor = clinicContext(req);
    const ctx = buildAuthContext(req);

    const format = req.query.format;
    if (format !== 'csv' && format !== 'xlsx') {
      throw new HttpError(
        400,
        'patients_export_invalid_format',
        'Formato inválido. Use format=csv ou format=xlsx.',
      );
    }

    // Raw CPF export is not allowed in this sprint — refuse explicitly rather
    // than silently ignoring, so the caller knows the flag had no effect.
    if (req.query.include_cpf_raw === 'true') {
      throw new HttpError(
        400,
        'patients_export_cpf_raw_not_allowed',
        'A exportação de CPF bruto não é permitida. O CPF é exportado apenas mascarado.',
      );
    }

    const file = await patientExportService.export(
      actor,
      { format: format as ExportFormat, search: parseSearch(req.query.search) },
      ctx,
    );

    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.status(200).send(file.body);
  },
};
