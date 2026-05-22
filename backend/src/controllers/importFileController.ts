import type { Request, Response } from 'express';
import { env } from '../config/env';
import { HttpError } from '../middlewares/errorHandler';
import { importFileRetentionService } from '../services/importFileRetentionService';
import { auditUploadFailure, uploadService } from '../services/uploadService';
import { buildAuthContext } from '../utils/authContext';

// Parses an optional positive-integer query param within [min, max]. Returns the
// fallback when absent; throws 400 on anything that isn't a clean integer in range.
function parseBoundedInt(
  value: unknown,
  field: string,
  min: number,
  max: number,
  fallback: number,
): number {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new HttpError(400, 'invalid_retention_params', `Parâmetro inválido: ${field}.`);
  }
  const n = Number(value);
  if (n < min || n > max) {
    throw new HttpError(
      400,
      'invalid_retention_params',
      `Parâmetro fora do intervalo permitido: ${field}.`,
    );
  }
  return n;
}

// requireAuth + requireClinic run before these handlers, so req.auth and
// req.auth.clinica_id are present. We re-check defensively and refuse with 403
// rather than trusting the middleware ordering blindly.
function requireClinicContext(req: Request): { clinica_id: string; usuario_id: string } {
  if (!req.auth) {
    throw new HttpError(401, 'unauthorized', 'Autenticação necessária.');
  }
  if (!req.auth.clinica_id) {
    throw new HttpError(403, 'no_clinic_context', 'Nenhuma clínica associada ao usuário.');
  }
  return { clinica_id: req.auth.clinica_id, usuario_id: req.auth.sub };
}

export const importFileController = {
  async upload(req: Request, res: Response): Promise<void> {
    const { clinica_id, usuario_id } = requireClinicContext(req);

    const file = req.file;
    if (!file) {
      await auditUploadFailure({ usuario_id, clinica_id }, buildAuthContext(req));
      throw new HttpError(400, 'file_required', 'Envie um arquivo CSV ou XLSX.');
    }

    const result = await uploadService.receiveFile(
      {
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        buffer: file.buffer,
      },
      { clinica_id, usuario_id },
      buildAuthContext(req),
    );

    res.status(201).json({ message: 'Arquivo enviado com sucesso.', file: result });
  },

  async list(req: Request, res: Response): Promise<void> {
    const { clinica_id } = requireClinicContext(req);
    const files = await uploadService.listForClinic(clinica_id);
    res.status(200).json({ files });
  },

  // Read-only retention DRY-RUN (Sprint 2.24): previews which old files WOULD be
  // cleanup candidates. Deletes nothing. Tenant-scoped; returns only safe
  // metadata (no filename/internal name/path/hash/content).
  async retentionDryRun(req: Request, res: Response): Promise<void> {
    const { clinica_id, usuario_id } = requireClinicContext(req);
    const retentionDays = parseBoundedInt(
      req.query.retention_days,
      'retention_days',
      1,
      365,
      env.IMPORT_FILE_RETENTION_DAYS,
    );
    const limit = parseBoundedInt(
      req.query.limit,
      'limit',
      1,
      env.IMPORT_FILE_RETENTION_DRY_RUN_MAX,
      env.IMPORT_FILE_RETENTION_DRY_RUN_MAX,
    );

    const result = await importFileRetentionService.dryRun(
      { clinica_id, usuario_id },
      { retentionDays, limit },
      buildAuthContext(req),
    );
    res.status(200).json(result);
  },
};
