import type { Request, Response } from 'express';
import { HttpError } from '../middlewares/errorHandler';
import { financialChargeService } from '../services/financialChargeService';
import type { FinancialActor } from '../services/financialChargeService';
import { buildAuthContext } from '../utils/authContext';

// Builds the FinancialActor for service calls. The route stack guarantees:
//   requireAuth → req.auth populated
//   requireClinic → users.ativo + same clinic enforced (DB check)
//   requireRole(['dono_clinica','secretaria']) → req.auth.papel in allowlist
//
// The service then loads `user_clinical_roles` once to derive the effective
// financial access ('full' | 'transact' | 'none' — ADR 0012 §7.2 reconciled
// with the smoke users layout where gestor/profissional share papel=secretaria).
async function financialActor(req: Request): Promise<FinancialActor> {
  if (!req.auth) {
    throw new HttpError(401, 'unauthorized', 'Autenticação necessária.');
  }
  if (!req.auth.clinica_id) {
    throw new HttpError(403, 'no_clinic_context', 'Nenhuma clínica associada ao usuário.');
  }
  return financialChargeService.buildActor({
    clinica_id: req.auth.clinica_id,
    usuario_id: req.auth.sub,
    papel: req.auth.papel,
  });
}

function asObject(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

export const financialChargeController = {
  // POST /financial/charges — create pending. ADR 0012 §11.1.
  async create(req: Request, res: Response): Promise<void> {
    const actor = await financialActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await financialChargeService.create(
      actor,
      {
        patient_id: body.patient_id,
        appointment_id: body.appointment_id,
        description: body.description,
        amount_cents: body.amount_cents,
        due_date: body.due_date,
        notes: body.notes,
      },
      ctx,
    );
    res.status(201).json(result);
  },

  // GET /financial/charges — list. ADR 0012 §11.2.
  async list(req: Request, res: Response): Promise<void> {
    const actor = await financialActor(req);
    const result = await financialChargeService.list(actor, {
      patient_id: req.query.patient_id,
      appointment_id: req.query.appointment_id,
      status: req.query.status,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.status(200).json(result);
  },

  // GET /financial/charges/:id — detail. ADR 0012 §11.3.
  async detail(req: Request, res: Response): Promise<void> {
    const actor = await financialActor(req);
    const result = await financialChargeService.findById(actor, req.params.id);
    res.status(200).json(result);
  },

  // PATCH /financial/charges/:id — update pending. ADR 0012 §11.4.
  async update(req: Request, res: Response): Promise<void> {
    const actor = await financialActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await financialChargeService.update(
      actor,
      req.params.id,
      {
        description: body.description,
        amount_cents: body.amount_cents,
        due_date: body.due_date,
        notes: body.notes,
        appointment_id: body.appointment_id,
      },
      ctx,
    );
    res.status(200).json(result);
  },

  // POST /financial/charges/:id/mark-paid — pending → paid. ADR 0012 §11.5.
  async markPaid(req: Request, res: Response): Promise<void> {
    const actor = await financialActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await financialChargeService.markPaid(
      actor,
      req.params.id,
      { payment_method: body.payment_method, paid_at: body.paid_at },
      ctx,
    );
    res.status(200).json(result);
  },

  // POST /financial/charges/:id/cancel — pending → canceled. ADR 0012 §11.6.
  async cancel(req: Request, res: Response): Promise<void> {
    const actor = await financialActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await financialChargeService.cancel(
      actor,
      req.params.id,
      { cancel_reason: body.cancel_reason },
      ctx,
    );
    res.status(200).json(result);
  },

  // GET /financial/summary — totalizadores. ADR 0012 §11.7.
  async summary(req: Request, res: Response): Promise<void> {
    const actor = await financialActor(req);
    const result = await financialChargeService.summary(actor, {
      date_from: req.query.date_from,
      date_to: req.query.date_to,
    });
    res.status(200).json(result);
  },

  // GET /patients/:id/charges — single-patient list. ADR 0012 §11.8.
  async listForPatient(req: Request, res: Response): Promise<void> {
    const actor = await financialActor(req);
    const result = await financialChargeService.listForPatient(
      actor,
      req.params.id,
      { limit: req.query.limit, offset: req.query.offset },
    );
    res.status(200).json(result);
  },
};
