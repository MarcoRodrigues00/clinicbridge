import type { Request, Response } from 'express';
import { HttpError } from '../middlewares/errorHandler';
import {
  buildInsuranceActor,
  insurancePlanService,
  insuranceProviderService,
  patientInsuranceService,
  serviceInsurancePriceService,
} from '../services/insuranceService';
import type { InsuranceActor } from '../services/insuranceService';
import { buildAuthContext } from '../utils/authContext';

// Convênios v0.1 controllers — Sprint 4.7B (ADR 0016).
//
// Single file holds the four sub-controllers because they share the same actor
// shape and the route module wires them with the same pipeline. The service
// layer is also a single file for the same reason.
//
// requireAuth + requireClinic + requireRole(...) run BEFORE these handlers.
// `buildInsuranceActor` loads clinical role grants once (mirrors financial
// `buildActor`); the services then assert `profissional_clinico` is absent
// (ADR 0016 §4 — convênios are off-limits to clinical-only operators).
async function insuranceActor(req: Request): Promise<InsuranceActor> {
  if (!req.auth) {
    throw new HttpError(401, 'unauthorized', 'Autenticação necessária.');
  }
  if (!req.auth.clinica_id) {
    throw new HttpError(403, 'no_clinic_context', 'Nenhuma clínica associada ao usuário.');
  }
  return buildInsuranceActor({
    clinica_id: req.auth.clinica_id,
    usuario_id: req.auth.sub,
  });
}

function asObject(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

// ----- providers -------------------------------------------------------------

export const insuranceProviderController = {
  async list(req: Request, res: Response): Promise<void> {
    const actor = await insuranceActor(req);
    const result = await insuranceProviderService.list(actor, {
      active: req.query.active,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.status(200).json(result);
  },

  async detail(req: Request, res: Response): Promise<void> {
    const actor = await insuranceActor(req);
    const result = await insuranceProviderService.findById(actor, req.params.id);
    res.status(200).json(result);
  },

  async create(req: Request, res: Response): Promise<void> {
    const actor = await insuranceActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await insuranceProviderService.create(
      actor,
      { name: body.name, notes: body.notes },
      ctx,
    );
    res.status(201).json(result);
  },

  async update(req: Request, res: Response): Promise<void> {
    const actor = await insuranceActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await insuranceProviderService.update(
      actor,
      req.params.id,
      { name: body.name, notes: body.notes },
      ctx,
    );
    res.status(200).json(result);
  },

  async updateStatus(req: Request, res: Response): Promise<void> {
    const actor = await insuranceActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await insuranceProviderService.updateStatus(
      actor,
      req.params.id,
      { active: body.active },
      ctx,
    );
    res.status(200).json(result);
  },
};

// ----- plans -----------------------------------------------------------------

export const insurancePlanController = {
  async list(req: Request, res: Response): Promise<void> {
    const actor = await insuranceActor(req);
    const result = await insurancePlanService.list(actor, {
      provider_id: req.query.provider_id,
      active: req.query.active,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.status(200).json(result);
  },

  async detail(req: Request, res: Response): Promise<void> {
    const actor = await insuranceActor(req);
    const result = await insurancePlanService.findById(actor, req.params.id);
    res.status(200).json(result);
  },

  async create(req: Request, res: Response): Promise<void> {
    const actor = await insuranceActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await insurancePlanService.create(
      actor,
      {
        provider_id: body.provider_id,
        name: body.name,
        notes: body.notes,
      },
      ctx,
    );
    res.status(201).json(result);
  },

  async update(req: Request, res: Response): Promise<void> {
    const actor = await insuranceActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await insurancePlanService.update(
      actor,
      req.params.id,
      { name: body.name, notes: body.notes },
      ctx,
    );
    res.status(200).json(result);
  },

  async updateStatus(req: Request, res: Response): Promise<void> {
    const actor = await insuranceActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await insurancePlanService.updateStatus(
      actor,
      req.params.id,
      { active: body.active },
      ctx,
    );
    res.status(200).json(result);
  },
};

// ----- patient insurances ----------------------------------------------------

export const patientInsuranceController = {
  async list(req: Request, res: Response): Promise<void> {
    const actor = await insuranceActor(req);
    const result = await patientInsuranceService.list(actor, req.params.patient_id, {
      active: req.query.active,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.status(200).json(result);
  },

  async detail(req: Request, res: Response): Promise<void> {
    const actor = await insuranceActor(req);
    const result = await patientInsuranceService.findById(
      actor,
      req.params.patient_id,
      req.params.id,
    );
    res.status(200).json(result);
  },

  async create(req: Request, res: Response): Promise<void> {
    const actor = await insuranceActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await patientInsuranceService.create(
      actor,
      req.params.patient_id,
      {
        provider_id: body.provider_id,
        plan_id: body.plan_id,
        member_number: body.member_number,
        holder_name: body.holder_name,
        valid_until: body.valid_until,
        notes: body.notes,
      },
      ctx,
    );
    res.status(201).json(result);
  },

  async update(req: Request, res: Response): Promise<void> {
    const actor = await insuranceActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await patientInsuranceService.update(
      actor,
      req.params.patient_id,
      req.params.id,
      {
        provider_id: body.provider_id,
        plan_id: body.plan_id,
        member_number: body.member_number,
        holder_name: body.holder_name,
        valid_until: body.valid_until,
        notes: body.notes,
      },
      ctx,
    );
    res.status(200).json(result);
  },

  async updateStatus(req: Request, res: Response): Promise<void> {
    const actor = await insuranceActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await patientInsuranceService.updateStatus(
      actor,
      req.params.patient_id,
      req.params.id,
      { active: body.active },
      ctx,
    );
    res.status(200).json(result);
  },
};

// ----- service insurance prices ---------------------------------------------

export const serviceInsurancePriceController = {
  async list(req: Request, res: Response): Promise<void> {
    const actor = await insuranceActor(req);
    const result = await serviceInsurancePriceService.list(actor, {
      service_id: req.query.service_id,
      provider_id: req.query.provider_id,
      plan_id: req.query.plan_id,
      active: req.query.active,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.status(200).json(result);
  },

  async detail(req: Request, res: Response): Promise<void> {
    const actor = await insuranceActor(req);
    const result = await serviceInsurancePriceService.findById(actor, req.params.id);
    res.status(200).json(result);
  },

  async create(req: Request, res: Response): Promise<void> {
    const actor = await insuranceActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await serviceInsurancePriceService.create(
      actor,
      {
        service_id: body.service_id,
        provider_id: body.provider_id,
        plan_id: body.plan_id,
        reference_price_cents: body.reference_price_cents,
        notes: body.notes,
      },
      ctx,
    );
    res.status(201).json(result);
  },

  async update(req: Request, res: Response): Promise<void> {
    const actor = await insuranceActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await serviceInsurancePriceService.update(
      actor,
      req.params.id,
      {
        reference_price_cents: body.reference_price_cents,
        notes: body.notes,
      },
      ctx,
    );
    res.status(200).json(result);
  },

  async updateStatus(req: Request, res: Response): Promise<void> {
    const actor = await insuranceActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await serviceInsurancePriceService.updateStatus(
      actor,
      req.params.id,
      { active: body.active },
      ctx,
    );
    res.status(200).json(result);
  },
};
