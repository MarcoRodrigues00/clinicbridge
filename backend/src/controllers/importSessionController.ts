import type { Request, Response } from 'express';
import { HttpError } from '../middlewares/errorHandler';
import { importDryRunService } from '../services/importDryRunService';
import { importExecutionService } from '../services/importExecutionService';
import { importSessionService } from '../services/importSessionService';
import { buildAuthContext } from '../utils/authContext';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clinicContext(req: Request): { clinica_id: string; usuario_id: string } {
  if (!req.auth) {
    throw new HttpError(401, 'unauthorized', 'Autenticação necessária.');
  }
  if (!req.auth.clinica_id) {
    throw new HttpError(403, 'no_clinic_context', 'Nenhuma clínica associada ao usuário.');
  }
  return { clinica_id: req.auth.clinica_id, usuario_id: req.auth.sub };
}

export const importSessionController = {
  async create(req: Request, res: Response): Promise<void> {
    const actor = clinicContext(req);
    const ctx = buildAuthContext(req);

    const body = (req.body ?? {}) as { import_file_id?: unknown; mapping?: unknown };
    const importFileId = body.import_file_id;
    if (typeof importFileId !== 'string' || !UUID_RE.test(importFileId)) {
      throw new HttpError(404, 'import_file_not_found', 'Arquivo não encontrado.');
    }

    const session = await importSessionService.create(importFileId, body.mapping, actor, ctx);
    res.status(201).json({ session });
  },

  async list(req: Request, res: Response): Promise<void> {
    const { clinica_id } = clinicContext(req);
    const sessions = await importSessionService.listForClinic(clinica_id);
    res.status(200).json({ sessions });
  },

  async get(req: Request, res: Response): Promise<void> {
    const { clinica_id } = clinicContext(req);
    const id = req.params.id;
    if (!UUID_RE.test(id)) {
      throw new HttpError(404, 'import_session_not_found', 'Sessão de migração não encontrada.');
    }
    const session = await importSessionService.getForClinic(id, clinica_id);
    res.status(200).json({ session });
  },

  async dryRun(req: Request, res: Response): Promise<void> {
    const actor = clinicContext(req);
    const ctx = buildAuthContext(req);
    const id = req.params.id;
    if (!UUID_RE.test(id)) {
      throw new HttpError(404, 'import_session_not_found', 'Sessão de migração não encontrada.');
    }
    const report = await importDryRunService.run(id, actor, ctx);
    res.status(200).json({ report });
  },

  async markReady(req: Request, res: Response): Promise<void> {
    const actor = clinicContext(req);
    const ctx = buildAuthContext(req);
    const id = req.params.id;
    if (!UUID_RE.test(id)) {
      throw new HttpError(404, 'import_session_not_found', 'Sessão de migração não encontrada.');
    }
    const session = await importSessionService.markReady(id, actor, ctx);
    res.status(200).json({ session });
  },

  async executeImport(req: Request, res: Response): Promise<void> {
    const actor = clinicContext(req);
    const ctx = buildAuthContext(req);
    const id = req.params.id;
    if (!UUID_RE.test(id)) {
      throw new HttpError(404, 'import_session_not_found', 'Sessão de migração não encontrada.');
    }
    const result = await importExecutionService.executeImport(id, actor, ctx);
    res.status(200).json({ result });
  },
};
