import type { Request, Response } from 'express';
import { HttpError } from '../middlewares/errorHandler';
import { appointmentService } from '../services/appointmentService';
import { buildAuthContext } from '../utils/authContext';

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

export const appointmentController = {
  async list(req: Request, res: Response): Promise<void> {
    const actor = clinicContext(req);
    const ctx = buildAuthContext(req);
    const result = await appointmentService.list(
      actor,
      {
        date: req.query.date,
        from: req.query.from,
        to: req.query.to,
        professional_id: req.query.professional_id,
        status: req.query.status,
        limit: req.query.limit,
      },
      ctx,
    );
    res.status(200).json(result);
  },

  async create(req: Request, res: Response): Promise<void> {
    const actor = clinicContext(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const appointment = await appointmentService.create(
      actor,
      {
        patient_id: body.patient_id,
        professional_id: body.professional_id,
        starts_at: body.starts_at,
        ends_at: body.ends_at,
        administrative_notes: body.administrative_notes,
        service_id: body.service_id,
      },
      ctx,
    );
    res.status(201).json({ appointment });
  },

  async detail(req: Request, res: Response): Promise<void> {
    const actor = clinicContext(req);
    const ctx = buildAuthContext(req);
    const appointment = await appointmentService.detail(actor, req.params.id, ctx);
    res.status(200).json({ appointment });
  },

  async updateStatus(req: Request, res: Response): Promise<void> {
    const actor = clinicContext(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const appointment = await appointmentService.updateStatus(
      actor,
      req.params.id,
      { status: body.status },
      ctx,
    );
    res.status(200).json({ appointment });
  },

  async reschedule(req: Request, res: Response): Promise<void> {
    const actor = clinicContext(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const appointment = await appointmentService.reschedule(
      actor,
      req.params.id,
      { starts_at: body.starts_at, ends_at: body.ends_at },
      ctx,
    );
    res.status(200).json({ appointment });
  },
};
