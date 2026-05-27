import type { Request, Response } from 'express';
import { HttpError } from '../middlewares/errorHandler';
import { reportsService } from '../services/reportsService';
import type { ReportActor } from '../services/reportsService';
import { buildAuthContext } from '../utils/authContext';

// Builds the ReportActor for service calls. The route stack guarantees:
//   requireAuth → req.auth populated
//   requireClinic → users.ativo + same clinic enforced (DB check)
//   requireRole(['dono_clinica','secretaria']) → req.auth.papel in allowlist
//
// The service then loads `user_clinical_roles` once to derive the effective
// financial access for R-B / R-D (same gate the Financeiro v0.1 uses).
async function reportActor(req: Request): Promise<ReportActor> {
  if (!req.auth) {
    throw new HttpError(401, 'unauthorized', 'Autenticação necessária.');
  }
  if (!req.auth.clinica_id) {
    throw new HttpError(403, 'no_clinic_context', 'Nenhuma clínica associada ao usuário.');
  }
  return reportsService.buildActor({
    clinica_id: req.auth.clinica_id,
    usuario_id: req.auth.sub,
    papel: req.auth.papel,
  });
}

export const reportsController = {
  // GET /reports/appointments — R-A. ADR 0014 §3.2.
  async appointments(req: Request, res: Response): Promise<void> {
    const actor = await reportActor(req);
    const ctx = buildAuthContext(req);
    const result = await reportsService.appointments(
      actor,
      {
        date_from: req.query.date_from,
        date_to: req.query.date_to,
        professional_id: req.query.professional_id,
      },
      ctx,
    );
    res.status(200).json(result);
  },

  // GET /reports/financial — R-B. ADR 0014 §3.3.
  async financial(req: Request, res: Response): Promise<void> {
    const actor = await reportActor(req);
    const ctx = buildAuthContext(req);
    const result = await reportsService.financial(
      actor,
      { date_from: req.query.date_from, date_to: req.query.date_to },
      ctx,
    );
    res.status(200).json(result);
  },

  // GET /reports/patients — R-C. ADR 0014 §3.4.
  async patients(req: Request, res: Response): Promise<void> {
    const actor = await reportActor(req);
    const ctx = buildAuthContext(req);
    const result = await reportsService.patients(
      actor,
      {
        date_from: req.query.date_from,
        date_to: req.query.date_to,
        no_appt_days: req.query.no_appt_days,
      },
      ctx,
    );
    res.status(200).json(result);
  },

  // GET /reports/agenda-financial — R-D. ADR 0014 §3.5.
  async agendaFinancial(req: Request, res: Response): Promise<void> {
    const actor = await reportActor(req);
    const ctx = buildAuthContext(req);
    const result = await reportsService.agendaFinancial(
      actor,
      {
        date_from: req.query.date_from,
        date_to: req.query.date_to,
        professional_id: req.query.professional_id,
      },
      ctx,
    );
    res.status(200).json(result);
  },
};
