import type { Request, Response } from 'express';
import { HttpError } from '../middlewares/errorHandler';
import { clinicServiceService } from '../services/clinicServiceService';
import type { CatalogActor } from '../services/clinicServiceService';
import { buildAuthContext } from '../utils/authContext';

// Catálogo de Serviços v0.1 — Sprint 4.6B (ADR 0015).
//
// requireAuth + requireClinic + requireRole(...) run BEFORE these handlers.
// We re-derive the clinic context defensively rather than trusting middleware
// ordering.
function catalogActor(req: Request): CatalogActor {
  if (!req.auth) {
    throw new HttpError(401, 'unauthorized', 'Autenticação necessária.');
  }
  if (!req.auth.clinica_id) {
    throw new HttpError(403, 'no_clinic_context', 'Nenhuma clínica associada ao usuário.');
  }
  return { clinica_id: req.auth.clinica_id, usuario_id: req.auth.sub };
}

function asObject(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

export const clinicServiceController = {
  // GET /clinic-services
  async list(req: Request, res: Response): Promise<void> {
    const actor = catalogActor(req);
    const result = await clinicServiceService.list(actor, {
      active: req.query.active,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.status(200).json(result);
  },

  // GET /clinic-services/:id
  async detail(req: Request, res: Response): Promise<void> {
    const actor = catalogActor(req);
    const result = await clinicServiceService.findById(actor, req.params.id);
    res.status(200).json(result);
  },

  // POST /clinic-services
  async create(req: Request, res: Response): Promise<void> {
    const actor = catalogActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await clinicServiceService.create(
      actor,
      {
        name: body.name,
        category: body.category,
        description: body.description,
        duration_minutes: body.duration_minutes,
        price_cents: body.price_cents,
      },
      ctx,
    );
    res.status(201).json(result);
  },

  // PATCH /clinic-services/:id
  async update(req: Request, res: Response): Promise<void> {
    const actor = catalogActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await clinicServiceService.update(
      actor,
      req.params.id,
      {
        name: body.name,
        category: body.category,
        description: body.description,
        duration_minutes: body.duration_minutes,
        price_cents: body.price_cents,
      },
      ctx,
    );
    res.status(200).json(result);
  },

  // PATCH /clinic-services/:id/status
  async updateStatus(req: Request, res: Response): Promise<void> {
    const actor = catalogActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await clinicServiceService.updateStatus(
      actor,
      req.params.id,
      { active: body.active },
      ctx,
    );
    res.status(200).json(result);
  },

  // GET /clinic-services/:id/professionals
  async listProfessionals(req: Request, res: Response): Promise<void> {
    const actor = catalogActor(req);
    const result = await clinicServiceService.listProfessionals(actor, req.params.id, {
      active: req.query.active,
    });
    res.status(200).json(result);
  },

  // POST /clinic-services/:id/professionals
  async linkProfessional(req: Request, res: Response): Promise<void> {
    const actor = catalogActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await clinicServiceService.linkProfessional(
      actor,
      req.params.id,
      { professional_id: body.professional_id },
      ctx,
    );
    res.status(201).json(result);
  },

  // PATCH /clinic-services/:id/professionals/:professional_id/status
  async updateProfessionalLinkStatus(req: Request, res: Response): Promise<void> {
    const actor = catalogActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await clinicServiceService.updateProfessionalLinkStatus(
      actor,
      req.params.id,
      req.params.professional_id,
      { active: body.active },
      ctx,
    );
    res.status(200).json(result);
  },
};
