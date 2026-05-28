import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { db } from '../src/config/db';
import { env } from '../src/config/env';
import { billingEventDao } from '../src/dao/billingEventDao';
import { clinicSubscriptionDao } from '../src/dao/clinicSubscriptionDao';
import { billingService, mockProvider } from '../src/services/billingService';
import {
  computeEntitlements,
  PLAN_CATALOG,
  type ModuleKey,
} from '../src/services/billingPlans';
import {
  canTransition,
  computeSoftLock,
} from '../src/services/billingStateMachine';
import { buildBillingActor } from '../src/services/billingService';
import type { PlanCode, SubscriptionStatus } from '../src/types/db';

// =============================================================================
// BILLING ADMIN / SMOKE — Sprint 5.1B (ADR 0018) — dev/staging ONLY
// =============================================================================
//
// There is NO public mutation endpoint for billing in 5.1B (ADR 0018 §8/§14).
// This dev-only CLI is the audited manual path for provisioning/transitioning a
// subscription and a self-test of the pure logic (state machine, soft-lock,
// entitlements) + the billing_events idempotency ledger.
//
// GUARD: refuses to run when NODE_ENV=production.
//
// Usage:
//   pnpm --filter backend exec tsx scripts/billing-admin.ts selftest
//   pnpm --filter backend exec tsx scripts/billing-admin.ts status <clinicId>
//   pnpm --filter backend exec tsx scripts/billing-admin.ts provision <clinicId> <plan> [status]
//   pnpm --filter backend exec tsx scripts/billing-admin.ts transition <clinicId> <toStatus>
//   pnpm --filter backend exec tsx scripts/billing-admin.ts cleanup <clinicId>
// =============================================================================

function log(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log(...args);
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  log(`  ok: ${msg}`);
}

async function findOwnerUserId(clinica_id: string): Promise<string | null> {
  const owner = await db('users')
    .where({ clinica_id, papel: 'dono_clinica', ativo: true })
    .first();
  return owner ? owner.id : null;
}

async function cmdStatus(clinica_id: string): Promise<void> {
  const ownerId = (await findOwnerUserId(clinica_id)) ?? randomUUID();
  const actor = await buildBillingActor({
    clinica_id,
    usuario_id: ownerId,
    papel: 'dono_clinica',
  });
  const { billing } = await billingService.getStatus(actor, {
    ip: null,
    user_agent: 'billing-admin-cli',
    request_id: null,
  });
  log(JSON.stringify(billing, null, 2));
}

async function cmdProvision(
  clinica_id: string,
  plan: PlanCode,
  status?: SubscriptionStatus,
): Promise<void> {
  const ownerId = await findOwnerUserId(clinica_id);
  const sub = await billingService.provisionSubscription({
    clinica_id,
    plan_code: plan,
    status,
    created_by_user_id: ownerId,
    identity: {
      clinic_name: 'CLI-provisioned (mock)',
      billing_email: 'billing@example.local',
      tax_id: null,
    },
    provider: mockProvider,
    ctx: { ip: null, user_agent: 'billing-admin-cli', request_id: null },
  });
  log(`provisioned subscription ${sub.id} (${sub.plan_code}/${sub.status}) provider=${sub.provider}`);
}

async function cmdTransition(
  clinica_id: string,
  to: SubscriptionStatus,
): Promise<void> {
  const ownerId = await findOwnerUserId(clinica_id);
  const updated = await billingService.transitionStatus({
    clinica_id,
    to,
    actor_user_id: ownerId,
    ctx: { ip: null, user_agent: 'billing-admin-cli', request_id: null },
  });
  log(`transitioned → ${updated.status}`);
}

// Remove all billing rows for a clinic (dev cleanup only — billing is synthetic
// commercial state, NOT clinic operational/clinical data).
async function cmdCleanup(clinica_id: string): Promise<void> {
  await db('billing_events').where({ clinica_id }).del();
  await db('billing_provider_subscriptions').where({ clinica_id }).del();
  await db('billing_provider_customers').where({ clinica_id }).del();
  await db('clinic_entitlements').where({ clinica_id }).del();
  await db('clinic_subscriptions').where({ clinica_id }).del();
  log(`cleaned up billing rows for clinic ${clinica_id}`);
}

async function cmdSelftest(): Promise<void> {
  log('== pure logic: state machine ==');
  assert(canTransition('trialing', 'active'), 'trialing → active allowed');
  assert(canTransition('active', 'past_due'), 'active → past_due allowed');
  assert(canTransition('past_due', 'suspended'), 'past_due → suspended allowed');
  assert(canTransition('suspended', 'active'), 'suspended → active allowed');
  assert(canTransition('manual_pilot', 'active'), 'manual_pilot → active allowed');
  assert(!canTransition('canceled', 'active'), 'canceled → active blocked (terminal)');
  assert(!canTransition('active', 'active'), 'no self-transition');
  assert(!canTransition('active', 'suspended'), 'active → suspended blocked (must pass past_due)');

  log('== pure logic: soft-lock ==');
  for (const s of ['trialing', 'active', 'manual_pilot'] as const) {
    const l = computeSoftLock(s, null);
    assert(l.can_create_new_records && !l.read_only_mode && l.export_allowed, `${s}: full access, export ok`);
  }
  const suspended = computeSoftLock('suspended', null);
  assert(
    !suspended.can_create_new_records && suspended.read_only_mode && suspended.export_allowed,
    'suspended: write-locked but export still allowed (no data hostage)',
  );
  const canceled = computeSoftLock('canceled', null);
  assert(canceled.export_allowed, 'canceled: export still allowed (LGPD portability)');
  const pastDueInGrace = computeSoftLock(
    'past_due',
    new Date(Date.now() + 86_400_000),
  );
  assert(pastDueInGrace.can_create_new_records, 'past_due within grace: can still create');
  const pastDueExpired = computeSoftLock(
    'past_due',
    new Date(Date.now() - 86_400_000),
  );
  assert(!pastDueExpired.can_create_new_records, 'past_due grace expired: write-locked');

  log('== pure logic: entitlements ==');
  const ess = computeEntitlements('essential');
  assert(ess.modules['module.patients'] === true, 'essential has patients');
  assert(ess.modules['module.inventory'] === false, 'essential lacks inventory');
  assert(ess.modules['module.clinical_records'] === false, 'essential lacks clinical (plan restricts only)');
  const pro = computeEntitlements('professional');
  assert(pro.modules['module.inventory'] === true, 'professional has inventory');
  for (const plan of Object.keys(PLAN_CATALOG) as PlanCode[]) {
    const e = computeEntitlements(plan);
    const moduleCount = (Object.keys(e.modules) as ModuleKey[]).length;
    assert(moduleCount === 9, `${plan}: 9 module keys present`);
  }
  // Override flips a module on for one tenant.
  const withOverride = computeEntitlements('essential', [
    {
      id: 'x',
      clinica_id: 'x',
      feature_key: 'module.inventory',
      enabled: true,
      limit_value: null,
      source: 'pilot',
      created_at: new Date(),
      updated_at: new Date(),
    },
  ]);
  assert(withOverride.modules['module.inventory'] === true, 'override unlocks inventory for tenant');

  log('== DB: billing_events idempotency ==');
  const externalId = `selftest_${randomUUID()}`;
  const first = await billingEventDao.recordIfNew({
    provider: 'mock',
    external_event_id: externalId,
    event_type: 'selftest.ping',
    clinica_id: null,
    payload_hash: 'deadbeef',
  });
  const second = await billingEventDao.recordIfNew({
    provider: 'mock',
    external_event_id: externalId,
    event_type: 'selftest.ping',
    clinica_id: null,
    payload_hash: 'deadbeef',
  });
  assert(Boolean(first) && !second, 'duplicate event is a no-op (idempotent)');
  await db('billing_events').where({ provider: 'mock', external_event_id: externalId }).del();
  log('  (cleaned up selftest event)');

  log('== DB: mock provider (no network) ==');
  const cust = await mockProvider.createCustomer({
    clinic_name: 'selftest',
    billing_email: 'x@example.local',
    tax_id: null,
  });
  assert(cust.external_customer_id.startsWith('mock_cus_'), 'mock customer id');
  const verifyOk = mockProvider.verifyWebhookSignature('{}', {
    'x-mock-signature': 'mock-signature',
  });
  const verifyBad = mockProvider.verifyWebhookSignature('{}', {});
  assert(verifyOk && !verifyBad, 'mock webhook signature verification works');

  log('\nALL SELFTESTS PASSED');
}

async function main(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    // eslint-disable-next-line no-console
    console.error('billing-admin: refusing to run in production.');
    process.exit(2);
  }
  const cmd = process.argv[2];
  try {
    switch (cmd) {
      case 'selftest':
        await cmdSelftest();
        break;
      case 'status':
        await cmdStatus(process.argv[3]);
        break;
      case 'provision':
        await cmdProvision(
          process.argv[3],
          process.argv[4] as PlanCode,
          process.argv[5] as SubscriptionStatus | undefined,
        );
        break;
      case 'transition':
        await cmdTransition(process.argv[3], process.argv[4] as SubscriptionStatus);
        break;
      case 'cleanup':
        await cmdCleanup(process.argv[3]);
        break;
      default:
        // eslint-disable-next-line no-console
        console.error(
          'Usage: tsx scripts/billing-admin.ts <selftest|status|provision|transition|cleanup> [args]',
        );
        process.exit(2);
    }
  } finally {
    await db.destroy();
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[billing-admin] failed:', err);
  process.exit(1);
});
