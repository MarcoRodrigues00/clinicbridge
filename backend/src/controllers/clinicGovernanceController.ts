import type { Request, Response } from 'express';
import { HttpError } from '../middlewares/errorHandler';
import { clinicGovernanceService } from '../services/clinicGovernanceService';
import { buildAuthContext } from '../utils/authContext';

// Builds the governance actor. The route stack gates with
// requireRole(CLINIC_ADMIN_ROLES) (dono_clinica) — the service additionally
// enforces titular-only for the write path (assertClinicTitular). This is an
// administrative endpoint: NO clinical content, NO billing.
function governanceActor(req: Request): { clinica_id: string; usuario_id: string } {
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

export const clinicGovernanceController = {
  // GET /clinic-governance — active governance members (metadata-only) of the
  // actor's clinic. Owner/titular only at the route. Audited (clinic.governance.list).
  async list(req: Request, res: Response): Promise<void> {
    const actor = governanceActor(req);
    const ctx = buildAuthContext(req);
    const result = await clinicGovernanceService.listForClinic(actor, ctx);
    res.status(200).json(result);
  },

  // POST /clinic-governance/admins — titular promotes a clinic member to
  // `administrador`. Service rejects non-titular actors, cross-tenant/inactive
  // targets, admin_sistema, and members that already hold governance. Does NOT
  // grant any clinical access. Audited (clinic.governance.admin.granted).
  async promoteAdministrator(req: Request, res: Response): Promise<void> {
    const actor = governanceActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const member = await clinicGovernanceService.promoteAdministrator(
      actor,
      { user_id: body.user_id },
      ctx,
    );
    res.status(201).json({ member });
  },
};
