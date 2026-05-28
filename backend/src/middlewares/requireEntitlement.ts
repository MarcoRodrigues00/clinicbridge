import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { clinicEntitlementDao } from '../dao/clinicEntitlementDao';
import { clinicSubscriptionDao } from '../dao/clinicSubscriptionDao';
import {
  computeEntitlements,
  type LimitKey,
  type ModuleKey,
} from '../services/billingPlans';
import { computeSoftLock } from '../services/billingStateMachine';
import type { PlanCode, SubscriptionStatus } from '../types/db';
import { HttpError } from './errorHandler';

// Entitlement guard / soft-lock helper — Sprint 5.1B (ADR 0018 §8).
//
// REUSABLE, but INTENTIONALLY NOT MOUNTED on any route in 5.1B (ADR 0018 §15:
// the foundation only CALCULATES entitlements/soft-lock; enforcement on real
// routes lands with the frontend/QA sprints 5.1C/5.1E). Compose AFTER
// requireAuth + requireClinic so req.auth.clinica_id is present.
//
// These mirror the default-status policy used by billingService.getStatus: an
// un-provisioned clinic is treated as a permissive `professional` manual pilot,
// so adding the guard later never accidentally locks an existing tenant.

const DEFAULT_PLAN: PlanCode = 'professional';
const DEFAULT_STATUS: SubscriptionStatus = 'manual_pilot';

async function loadPlanState(
  clinica_id: string,
): Promise<{ plan_code: PlanCode; status: SubscriptionStatus; grace_until: Date | null }> {
  const sub = await clinicSubscriptionDao.findByClinic(clinica_id);
  return {
    plan_code: sub ? sub.plan_code : DEFAULT_PLAN,
    status: sub ? sub.status : DEFAULT_STATUS,
    grace_until: sub ? sub.grace_until : null,
  };
}

// Block when the clinic's plan does not include the module. Upgrade message,
// not an error: 403 `feature_not_in_plan`.
export function requireEntitlement(feature: ModuleKey): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.auth?.clinica_id) {
      next(new HttpError(403, 'no_clinic_context', 'Nenhuma clínica associada ao usuário.'));
      return;
    }
    try {
      const { plan_code } = await loadPlanState(req.auth.clinica_id);
      const overrides = await clinicEntitlementDao.listForClinic(req.auth.clinica_id);
      const entitlements = computeEntitlements(plan_code, overrides);
      if (!entitlements.modules[feature]) {
        next(
          new HttpError(
            403,
            'feature_not_in_plan',
            'Este recurso não está incluído no plano atual da clínica.',
          ),
        );
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Block new writes while the subscription is soft-locked (suspended/canceled/
// expired grace). Reads/exports stay allowed (never sequester data). 403
// `subscription_suspended` — a regularization message, not an error.
export function requireNotSoftLocked(): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.auth?.clinica_id) {
      next(new HttpError(403, 'no_clinic_context', 'Nenhuma clínica associada ao usuário.'));
      return;
    }
    try {
      const { status, grace_until } = await loadPlanState(req.auth.clinica_id);
      const lock = computeSoftLock(status, grace_until);
      if (!lock.can_create_new_records) {
        next(
          new HttpError(
            403,
            'subscription_suspended',
            'Regularize a assinatura para voltar a criar novos registros. ' +
              'A leitura e a exportação dos seus dados continuam disponíveis.',
          ),
        );
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Numeric-limit check helper for use INSIDE services (e.g. before creating a
// user/professional/import). Throws 403 `limit_reached` when currentCount would
// exceed the plan limit. null limit = unlimited (never throws).
export async function assertWithinLimit(
  clinica_id: string,
  limitKey: LimitKey,
  currentCount: number,
): Promise<void> {
  const { plan_code } = await loadPlanState(clinica_id);
  const overrides = await clinicEntitlementDao.listForClinic(clinica_id);
  const entitlements = computeEntitlements(plan_code, overrides);
  const limit = entitlements.limits[limitKey];
  if (limit !== null && currentCount >= limit) {
    throw new HttpError(
      403,
      'limit_reached',
      'O limite do plano atual da clínica foi atingido.',
    );
  }
}
