import type { Request, Response } from 'express';
import { HttpError } from '../middlewares/errorHandler';
import { clinicProfessionalService } from '../services/clinicProfessionalService';
import { buildAuthContext } from '../utils/authContext';

// requireAuth + requireClinic run before these handlers. We re-derive the clinic
// context defensively rather than trusting middleware ordering.
function clinicContext(req: Request): { clinica_id: string; usuario_id: string } {
  if (!req.auth) throw new HttpError(401, 'unauthorized', 'Autenticação necessária.');
  if (!req.auth.clinica_id) {
    throw new HttpError(403, 'no_clinic_context', 'Nenhuma clínica associada ao usuário.');
  }
  return { clinica_id: req.auth.clinica_id, usuario_id: req.auth.sub };
}

function asObject(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
}

export const clinicProfessionalController = {
  async list(req: Request, res: Response): Promise<void> {
    const actor = clinicContext(req);
    const result = await clinicProfessionalService.list(actor, { active: req.query.active });
    res.status(200).json(result);
  },

  async create(req: Request, res: Response): Promise<void> {
    const actor = clinicContext(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const professional = await clinicProfessionalService.create(
      actor,
      { name: body.name, specialty_label: body.specialty_label },
      ctx,
    );
    res.status(201).json({ professional });
  },

  async update(req: Request, res: Response): Promise<void> {
    const actor = clinicContext(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const professional = await clinicProfessionalService.update(
      actor,
      req.params.id,
      { name: body.name, specialty_label: body.specialty_label, is_active: body.is_active },
      ctx,
    );
    res.status(200).json({ professional });
  },

  async deactivate(req: Request, res: Response): Promise<void> {
    const actor = clinicContext(req);
    const ctx = buildAuthContext(req);
    const professional = await clinicProfessionalService.deactivate(actor, req.params.id, ctx);
    res.status(200).json({ professional });
  },
};
