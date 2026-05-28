import type { Request, Response } from 'express';
import { HttpError } from '../middlewares/errorHandler';
import { billingService } from '../services/billingService';
import type { BillingActor } from '../services/billingService';
import { buildAuthContext } from '../utils/authContext';

// Billing controller — Sprint 5.1B (ADR 0018).
//
// The route stack guarantees: requireAuth → requireClinic → requireRole(
// ['dono_clinica','secretaria']). The service then loads user_clinical_roles
// once to apply the fine-grained read policy (profissional_clinico → 403).
async function billingActor(req: Request): Promise<BillingActor> {
  if (!req.auth) {
    throw new HttpError(401, 'unauthorized', 'Autenticação necessária.');
  }
  if (!req.auth.clinica_id) {
    throw new HttpError(403, 'no_clinic_context', 'Nenhuma clínica associada ao usuário.');
  }
  return billingService.buildActor({
    clinica_id: req.auth.clinica_id,
    usuario_id: req.auth.sub,
    papel: req.auth.papel,
  });
}

export const billingController = {
  // GET /billing/status — plan/state/entitlements/soft-lock for the caller's
  // clinic. Read-only; no PII, no money, no provider external IDs in the body.
  async status(req: Request, res: Response): Promise<void> {
    const actor = await billingActor(req);
    const ctx = buildAuthContext(req);
    const result = await billingService.getStatus(actor, ctx);
    res.status(200).json(result);
  },
};
