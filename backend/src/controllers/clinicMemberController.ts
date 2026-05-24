import type { Request, Response } from 'express';
import { HttpError } from '../middlewares/errorHandler';
import { clinicMemberService } from '../services/clinicMemberService';
import { buildAuthContext } from '../utils/authContext';

// requireAuth + requireClinic + requireRole(CLINIC_ADMIN_ROLES) ran on these
// routes; we re-derive the owner identity defensively from req.auth.
function ownerActor(req: Request): { clinica_id: string; usuario_id: string } {
  if (!req.auth) throw new HttpError(401, 'unauthorized', 'Autenticação necessária.');
  if (!req.auth.clinica_id) {
    throw new HttpError(403, 'no_clinic_context', 'Nenhuma clínica associada ao usuário.');
  }
  return { clinica_id: req.auth.clinica_id, usuario_id: req.auth.sub };
}

export const clinicMemberController = {
  async list(req: Request, res: Response): Promise<void> {
    const members = await clinicMemberService.list(ownerActor(req), buildAuthContext(req));
    res.status(200).json({ members });
  },

  async deactivate(req: Request, res: Response): Promise<void> {
    const result = await clinicMemberService.deactivate(
      ownerActor(req),
      req.params.userId,
      buildAuthContext(req),
    );
    res.status(200).json(result);
  },
};
