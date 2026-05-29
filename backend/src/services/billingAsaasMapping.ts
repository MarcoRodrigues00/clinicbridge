import type { SubscriptionStatus } from '../types/db';

// Asaas event → internal subscription-status mapping — Sprint 5.1E (ADR 0018).
//
// PURE module: no DB, no I/O, no network. Tiny and testable so the webhook
// handler (billingWebhookService.ts) stays thin and the mapping is verifiable in
// isolation (scripts/billing-admin.ts asaas:selftest).
//
// Asaas webhooks are about the CHARGE (cobrança), not the subscription object
// itself — a subscription's lifecycle is observed through the PAYMENT_* events
// of the charges it generates (spike 5.1D finding). We map only the events that
// have an unambiguous commercial meaning; everything else maps to `null` ("no
// automatic transition — record only"). The webhook NEVER mutates the
// subscription in 5.1E; this function only computes the INTENDED internal status
// so a later sprint can apply it under review.
//
// [VERIFICAR] The exact set/spelling of Asaas event names must be confirmed
// against real sandbox payloads before any transition is APPLIED. The list below
// is the conservative subset documented by Asaas; unknown names are safe no-ops.

// Recognized Asaas charge events we attribute a clear meaning to.
export const ASAAS_EVENT_TO_STATUS: Readonly<Record<string, SubscriptionStatus>> = {
  // Payment settled → the subscription is paid/current.
  PAYMENT_CONFIRMED: 'active',
  PAYMENT_RECEIVED: 'active',
  PAYMENT_RECEIVED_IN_CASH: 'active',
  // Charge past its due date without payment → commercial dunning begins.
  PAYMENT_OVERDUE: 'past_due',
};

// Returns the INTENDED internal status for an Asaas event, or `null` when the
// event carries no automatic transition (unknown, refund, deletion, chargeback,
// informational). `null` = "record the event, change nothing".
export function mapAsaasEventToInternalStatus(
  eventType: string,
): SubscriptionStatus | null {
  return ASAAS_EVENT_TO_STATUS[eventType] ?? null;
}
