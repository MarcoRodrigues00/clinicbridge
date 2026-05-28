import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import { billingEventDao } from '../dao/billingEventDao';
import { billingProviderCustomerDao } from '../dao/billingProviderCustomerDao';
import { billingProviderSubscriptionDao } from '../dao/billingProviderSubscriptionDao';
import { clinicEntitlementDao } from '../dao/clinicEntitlementDao';
import { clinicSubscriptionDao } from '../dao/clinicSubscriptionDao';
import { userClinicalRoleDao } from '../dao/userClinicalRoleDao';
import { HttpError } from '../middlewares/errorHandler';
import type {
  BillingProviderName,
  ClinicSubscriptionRow,
  PlanCode,
  SubscriptionStatus,
  UserClinicalRoleName,
  UserPapel,
} from '../types/db';
import type { AuthContext } from './authService';
import {
  computeEntitlements,
  isPlanCode,
  type ComputedEntitlements,
  type EffectiveEntitlement,
} from './billingPlans';
import { mockProvider } from './billingMockProvider';
import type { BillingProvider, ClinicBillingIdentity } from './billingProvider';
import {
  canTransition,
  computeSoftLock,
  PROVISIONABLE_STATUSES,
  type SoftLockFlags,
} from './billingStateMachine';

// Billing/entitlements service — Sprint 5.1B (ADR 0018).
//
// COMMERCIAL layer (the SaaS charging the clinic). NEVER touches the clinic's
// internal financial module (ADR 0012) or any clinical/operational table.
//
// ACCESS POLICY (GET /billing/status) — documented decision for 5.1B:
//   route gate: requireRole(['dono_clinica','secretaria']) (broad, like the
//   financial/inventory modules). The fine-grained policy lives HERE:
//     - papel=dono_clinica                               → read (owner sees plan)
//     - papel=secretaria, no clinical grant              → read (operational
//                                                           transparency: staff
//                                                           sees past_due/locks)
//     - papel=secretaria + gestor_clinica grant          → read (management)
//     - papel=secretaria + profissional_clinico grant    → 403 (clinical staff
//                                                           do not manage/see
//                                                           commercial data)
//     - papel=admin_sistema                              → blocked upstream by
//                                                           requireClinic
//                                                           (no_clinic_context)
//   NO public mutation endpoint exists. Provisioning/transition are manual/
//   dev-only service methods (used by scripts/billing-admin.ts), never wired to
//   a public route — the commercial state changes only by a verified webhook
//   (future 5.1E) or an audited manual action.
//
// The status payload carries NO PII, NO money, and NO provider external IDs.

const DEFAULT_PLAN: PlanCode = 'professional';
// Un-provisioned clinics are treated as a no-charge manual pilot: full access,
// no soft-lock, and `provisioned:false` so the UI/ops know it is a synthesized
// default, not a real subscription. Nothing is persisted on read (the state
// changes only by webhook/manual action — ADR 0018 §2.6).
const DEFAULT_STATUS: SubscriptionStatus = 'manual_pilot';

export interface BillingActorInput {
  clinica_id: string;
  usuario_id: string;
  papel: UserPapel;
}

export interface BillingActor extends BillingActorInput {
  clinical_grants: Set<UserClinicalRoleName>;
}

export async function buildBillingActor(
  input: BillingActorInput,
): Promise<BillingActor> {
  const grants = await userClinicalRoleDao.listActiveRoleNames(
    input.usuario_id,
    input.clinica_id,
  );
  return { ...input, clinical_grants: new Set(grants) };
}

function forbidden(): HttpError {
  return new HttpError(
    403,
    'forbidden_role',
    'Você não tem permissão para consultar a assinatura.',
  );
}

// profissional_clinico (a secretaria-papel + clinical grant) does not see
// commercial data. Everyone else admitted by the route gate may read.
function assertBillingRead(actor: BillingActor): void {
  if (actor.clinical_grants.has('profissional_clinico')) {
    throw forbidden();
  }
}

// ----- Public status projection (NO PII, NO money, NO external IDs) ----------

export interface PublicBillingStatus {
  // Whether a real clinic_subscriptions row backs this status. When false the
  // values below are the synthesized permissive default (manual pilot).
  provisioned: boolean;
  plan_code: PlanCode;
  status: SubscriptionStatus;
  provider: BillingProviderName | null;
  trial_ends_at: Date | null;
  current_period_start: Date | null;
  current_period_end: Date | null;
  grace_until: Date | null;
  canceled_at: Date | null;
  entitlements: {
    modules: ComputedEntitlements['modules'];
    limits: ComputedEntitlements['limits'];
    features: EffectiveEntitlement[];
  };
  soft_lock: SoftLockFlags;
}

async function safeAudit(
  acao: string,
  recurso_id: string | null,
  actor: BillingActor,
  ctx: AuthContext,
): Promise<void> {
  try {
    await auditLogDao.create({
      acao,
      usuario_id: actor.usuario_id,
      clinica_id: actor.clinica_id,
      recurso: 'billing_subscription',
      recurso_id,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
    });
  } catch (err) {
    // Metadata-only, best-effort. Never blocks the read/operation. NEVER logs
    // plan/status values that are not already in the metadata-only audit row.
    logger.error({ err, acao, audit_write_failed: true }, 'billing audit write failed');
  }
}

export const billingService = {
  buildActor: buildBillingActor,

  // GET /billing/status — current plan/state/entitlements/soft-lock for the
  // caller's clinic. Tenant comes from the verified JWT (req.auth.clinica_id),
  // never from input. Read-only; never persists anything.
  async getStatus(
    actor: BillingActor,
    ctx: AuthContext,
  ): Promise<{ billing: PublicBillingStatus }> {
    assertBillingRead(actor);

    const sub = await clinicSubscriptionDao.findByClinic(actor.clinica_id);
    const overrides = await clinicEntitlementDao.listForClinic(actor.clinica_id);

    const plan_code = sub ? sub.plan_code : DEFAULT_PLAN;
    const status = sub ? sub.status : DEFAULT_STATUS;
    const grace_until = sub ? sub.grace_until : null;

    const entitlements = computeEntitlements(plan_code, overrides);
    const soft_lock = computeSoftLock(status, grace_until);

    const billing: PublicBillingStatus = {
      provisioned: Boolean(sub),
      plan_code,
      status,
      provider: sub ? sub.provider : null,
      trial_ends_at: sub ? sub.trial_ends_at : null,
      current_period_start: sub ? sub.current_period_start : null,
      current_period_end: sub ? sub.current_period_end : null,
      grace_until,
      canceled_at: sub ? sub.canceled_at : null,
      entitlements,
      soft_lock,
    };

    await safeAudit('billing.status.read', sub ? sub.id : null, actor, ctx);
    return { billing };
  },

  // ----- MANUAL / DEV-ONLY operations (NOT exposed as public routes) ---------
  // These exist so the architecture is complete and smoke-testable. In a later
  // sprint they are driven by a verified webhook (5.1E) or an admin panel; in
  // 5.1B they are reachable only from scripts/billing-admin.ts.

  // Provision a subscription for a clinic (manual/pilot sale). Optionally binds
  // a provider customer + subscription via the abstraction (mock by default).
  async provisionSubscription(opts: {
    clinica_id: string;
    plan_code: PlanCode;
    status?: SubscriptionStatus;
    created_by_user_id: string | null;
    identity?: ClinicBillingIdentity;
    provider?: BillingProvider;
    ctx?: AuthContext;
  }): Promise<ClinicSubscriptionRow> {
    if (!isPlanCode(opts.plan_code)) {
      throw new HttpError(400, 'billing_invalid', 'plan_code inválido.');
    }
    const status: SubscriptionStatus = opts.status ?? 'manual_pilot';
    if (!PROVISIONABLE_STATUSES.includes(status)) {
      throw new HttpError(
        400,
        'billing_invalid',
        `status inicial inválido. Use um de: ${PROVISIONABLE_STATUSES.join(', ')}.`,
      );
    }

    const existing = await clinicSubscriptionDao.findByClinic(opts.clinica_id);
    if (existing) {
      throw new HttpError(
        409,
        'subscription_exists',
        'Esta clínica já possui uma assinatura.',
      );
    }

    // Optional provider binding (mock-only in 5.1B). NEVER sends patient PII —
    // only the clinic billing identity (ADR 0018 §9).
    const provider = opts.provider ?? null;
    const providerName: BillingProviderName | null = provider ? provider.name : null;

    const sub = await clinicSubscriptionDao.create({
      clinica_id: opts.clinica_id,
      plan_code: opts.plan_code,
      status,
      provider: providerName,
      created_by_user_id: opts.created_by_user_id,
    });

    if (provider && opts.identity) {
      const { external_customer_id } = await provider.createCustomer(opts.identity);
      await billingProviderCustomerDao.create({
        clinica_id: opts.clinica_id,
        provider: provider.name,
        external_customer_id,
      });
      const { external_subscription_id } = await provider.createSubscription(
        external_customer_id,
        opts.plan_code,
      );
      await billingProviderSubscriptionDao.create({
        clinica_id: opts.clinica_id,
        subscription_id: sub.id,
        provider: provider.name,
        external_subscription_id,
      });
    }

    if (opts.ctx) {
      await auditLogDao.create({
        acao: 'billing.subscription.provisioned',
        usuario_id: opts.created_by_user_id,
        clinica_id: opts.clinica_id,
        recurso: 'billing_subscription',
        recurso_id: sub.id,
        ip: opts.ctx.ip,
        user_agent: opts.ctx.user_agent,
        request_id: opts.ctx.request_id,
      });
    }
    return sub;
  },

  // Transition a subscription's status with state-machine validation.
  async transitionStatus(opts: {
    clinica_id: string;
    to: SubscriptionStatus;
    grace_until?: Date | null;
    actor_user_id: string | null;
    ctx?: AuthContext;
  }): Promise<ClinicSubscriptionRow> {
    const sub = await clinicSubscriptionDao.findByClinic(opts.clinica_id);
    if (!sub) {
      throw new HttpError(404, 'subscription_not_found', 'Assinatura não encontrada.');
    }
    if (!canTransition(sub.status, opts.to)) {
      throw new HttpError(
        400,
        'invalid_transition',
        `Transição inválida: ${sub.status} → ${opts.to}.`,
      );
    }
    const updated = await clinicSubscriptionDao.updateStatus(
      opts.clinica_id,
      sub.status,
      opts.to,
      { grace_until: opts.grace_until },
    );
    if (!updated) {
      // CAS miss — a concurrent transition moved the row first.
      throw new HttpError(
        409,
        'transition_conflict',
        'A assinatura mudou de estado durante a operação.',
      );
    }
    if (opts.ctx) {
      await auditLogDao.create({
        acao: 'billing.subscription.transitioned',
        usuario_id: opts.actor_user_id,
        clinica_id: opts.clinica_id,
        recurso: 'billing_subscription',
        recurso_id: updated.id,
        ip: opts.ctx.ip,
        user_agent: opts.ctx.user_agent,
        request_id: opts.ctx.request_id,
      });
    }
    return updated;
  },

  // Idempotently record a provider event (idempotency ledger). Returns whether
  // the event was new. Used by the future webhook handler (5.1E) and by smoke.
  async recordProviderEvent(opts: {
    provider: BillingProviderName;
    external_event_id: string;
    event_type: string;
    clinica_id: string | null;
    payload_hash: string | null;
  }): Promise<{ recorded: boolean }> {
    const row = await billingEventDao.recordIfNew(opts);
    return { recorded: Boolean(row) };
  },
};

// Re-export the singleton provider so callers do not import the class directly.
export { mockProvider };
