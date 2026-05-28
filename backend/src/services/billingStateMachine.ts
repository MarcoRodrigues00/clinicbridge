import type { SubscriptionStatus } from '../types/db';

// Subscription state machine + soft-lock — Sprint 5.1B (ADR 0018 §6, §7).
//
// PURE module: no DB, no I/O. The state transitions and soft-lock flags are
// pure functions so they are testable and reused by the service and by future
// webhook handlers (5.1E) without duplication.

// Allowed transitions (ADR 0018 §6). `canceled` is terminal in v0.1 (a new
// commercial relationship would create a fresh subscription, out of scope).
const TRANSITIONS: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
  trialing: ['active', 'past_due', 'canceled'],
  active: ['past_due', 'canceled'],
  past_due: ['active', 'suspended', 'canceled'],
  suspended: ['active', 'canceled'],
  canceled: [],
  // Assisted pilot converts to a paid Professional subscription, or is canceled.
  manual_pilot: ['active', 'canceled'],
};

// Statuses a subscription may be CREATED in (provisioning entry points).
export const PROVISIONABLE_STATUSES: readonly SubscriptionStatus[] = [
  'trialing',
  'active',
  'manual_pilot',
];

export function canTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): boolean {
  if (from === to) return false;
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(
  from: SubscriptionStatus,
): readonly SubscriptionStatus[] {
  return TRANSITIONS[from];
}

// Soft-lock flags (ADR 0018 §7). v0.1 only CALCULATES these — no route enforces
// them yet. INVARIANT: export is ALWAYS allowed (LGPD portability — never
// sequester the clinic's data). `read_only_mode` blocks new writes only.
export interface SoftLockFlags {
  can_create_new_records: boolean;
  read_only_mode: boolean;
  export_allowed: boolean;
  // Stable machine-readable reason code (NOT a user message). null = no lock.
  lock_reason: string | null;
}

const UNLOCKED: SoftLockFlags = {
  can_create_new_records: true,
  read_only_mode: false,
  export_allowed: true,
  lock_reason: null,
};

function locked(reason: string): SoftLockFlags {
  return {
    can_create_new_records: false,
    read_only_mode: true,
    export_allowed: true, // never sequester data
    lock_reason: reason,
  };
}

// Derive the soft-lock posture from the subscription status (+ grace window).
// past_due keeps full write access WHILE within the tolerance window
// (grace_until null OR now < grace_until); once the grace passes, writes are
// soft-locked even though the canonical status stays past_due until a webhook/
// manual action moves it to `suspended`.
export function computeSoftLock(
  status: SubscriptionStatus,
  grace_until: Date | null,
  now: Date = new Date(),
): SoftLockFlags {
  switch (status) {
    case 'trialing':
    case 'active':
    case 'manual_pilot':
      return { ...UNLOCKED };
    case 'past_due': {
      const graceActive = grace_until === null || now.getTime() < grace_until.getTime();
      if (graceActive) {
        return {
          can_create_new_records: true,
          read_only_mode: false,
          export_allowed: true,
          lock_reason: 'payment_pending',
        };
      }
      return locked('grace_period_expired');
    }
    case 'suspended':
      return locked('subscription_suspended');
    case 'canceled':
      return locked('subscription_canceled');
    default:
      // Exhaustive in practice; defensive lock for an unexpected status.
      return locked('subscription_inactive');
  }
}
