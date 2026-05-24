import type { Request, Response } from 'express';
import { z } from 'zod';
import { HttpError } from '../middlewares/errorHandler';
import { clinicJoinRequestService } from '../services/clinicJoinRequestService';
import { buildAuthContext } from '../utils/authContext';

const CreateSchema = z.object({
  invite_code: z.string().min(1, 'Código de convite é obrigatório.').max(40),
  clinic_name: z.string().max(160).optional(),
  message: z.string().max(280).optional(),
});

function parseOrThrow<T extends z.ZodTypeAny>(schema: T, body: unknown): z.output<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const fields = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    throw new HttpError(400, 'validation_failed', 'Dados inválidos.', { fields });
  }
  return result.data;
}

// Requester identity (no clinic required — staff awaiting approval has none).
function userActor(req: Request): { usuario_id: string } {
  if (!req.auth) throw new HttpError(401, 'unauthorized', 'Autenticação necessária.');
  return { usuario_id: req.auth.sub };
}

// Owner identity. requireClinic + requireRole(owner) already ran on these routes;
// we re-derive defensively rather than trusting middleware ordering.
function ownerActor(req: Request): { clinica_id: string; usuario_id: string } {
  if (!req.auth) throw new HttpError(401, 'unauthorized', 'Autenticação necessária.');
  if (!req.auth.clinica_id) throw new HttpError(403, 'no_clinic_context', 'Nenhuma clínica associada ao usuário.');
  return { clinica_id: req.auth.clinica_id, usuario_id: req.auth.sub };
}

export const clinicJoinRequestController = {
  async inviteCode(req: Request, res: Response): Promise<void> {
    const result = await clinicJoinRequestService.getInviteCode(ownerActor(req));
    res.status(200).json(result);
  },

  async regenerateInviteCode(req: Request, res: Response): Promise<void> {
    const result = await clinicJoinRequestService.regenerateInviteCode(
      ownerActor(req),
      buildAuthContext(req),
    );
    res.status(200).json(result);
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = parseOrThrow(CreateSchema, req.body);
    const request = await clinicJoinRequestService.requestJoin(userActor(req), input, buildAuthContext(req));
    res.status(201).json({ request });
  },

  async listMine(req: Request, res: Response): Promise<void> {
    const requests = await clinicJoinRequestService.listMine(userActor(req));
    res.status(200).json({ requests });
  },

  async cancel(req: Request, res: Response): Promise<void> {
    const request = await clinicJoinRequestService.cancelMine(userActor(req), req.params.id, buildAuthContext(req));
    res.status(200).json({ request });
  },

  async listPending(req: Request, res: Response): Promise<void> {
    const requests = await clinicJoinRequestService.listPending(ownerActor(req));
    res.status(200).json({ requests });
  },

  async approve(req: Request, res: Response): Promise<void> {
    const result = await clinicJoinRequestService.approve(ownerActor(req), req.params.id, buildAuthContext(req));
    res.status(200).json(result);
  },

  async reject(req: Request, res: Response): Promise<void> {
    const result = await clinicJoinRequestService.reject(ownerActor(req), req.params.id, buildAuthContext(req));
    res.status(200).json(result);
  },
};
