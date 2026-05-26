import type { Request, Response } from 'express';
import { HttpError } from '../middlewares/errorHandler';
import { userClinicalRoleService } from '../services/userClinicalRoleService';
import { buildAuthContext } from '../utils/authContext';

// Builds the owner actor for clinical-role administration. The route stack
// gates with `requireRole(CLINIC_ADMIN_ROLES)` (dono_clinica only), so this
// helper only needs auth + clinic context — no clinicalRoles set (this is
// an administrative endpoint, not a clinical content endpoint).
function ownerActor(req: Request): { clinica_id: string; usuario_id: string } {
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

export const userClinicalRoleController = {
  // GET /clinical/roles — list active clinical role grants in the owner's
  // clinic. Owner-only at the route. Used by future UI to render the team
  // matrix; for now also useful for staging diagnostics.
  async listActive(req: Request, res: Response): Promise<void> {
    const actor = ownerActor(req);
    const result = await userClinicalRoleService.listActive(actor);
    res.status(200).json(result);
  },

  // POST /clinical/roles/grant — owner grants `profissional_clinico` or
  // `gestor_clinica` to a clinic member. Service rejects:
  //   - target not in the owner's clinic → 404 member_not_found
  //   - target inactive / admin_sistema  → 404 member_not_found
  //   - duplicate active grant           → 400 clinical_role_already_granted
  // Audit (`clinical.role.granted.success`) is best-effort in audit_logs.
  async grant(req: Request, res: Response): Promise<void> {
    const actor = ownerActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const grant = await userClinicalRoleService.grant(
      actor,
      { user_id: body.user_id, role: body.role },
      ctx,
    );
    res.status(201).json({ grant });
  },

  // POST /clinical/roles/revoke — owner revokes an active grant by its row id.
  // Service uses CAS in the DAO + records the revocation audit
  // (`clinical.role.revoked.success`) INSIDE the same transaction; a CAS
  // miss surfaces a generic 404 (anti-enumeration of "already revoked" vs
  // "wrong clinic").
  async revoke(req: Request, res: Response): Promise<void> {
    const actor = ownerActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    if (typeof body.id !== 'string' || body.id.length === 0) {
      throw new HttpError(400, 'invalid_clinical_role', 'id é obrigatório.');
    }
    const result = await userClinicalRoleService.revoke(actor, body.id, ctx);
    res.status(200).json(result);
  },
};
