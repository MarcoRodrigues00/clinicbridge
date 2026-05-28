import { randomUUID } from 'node:crypto';
import type { PlanCode } from '../types/db';
import type {
  BillingProvider,
  ClinicBillingIdentity,
  CreateSubscriptionResult,
  ParsedWebhookEvent,
} from './billingProvider';

// MockProvider — Sprint 5.1B (ADR 0018 §13).
//
// In-memory, NO network, NO secrets, NO real gateway. Lets the whole
// subscription/entitlement/soft-lock pipeline be built and exercised before the
// spike (5.1D) picks a real gateway. It deliberately stores nothing globally —
// the canonical state lives in the DB (clinic_subscriptions + provider maps).
//
// `MOCK_WEBHOOK_TOKEN` is NOT a secret: it is a fixed marker so a dev/test can
// simulate a "valid signature" deterministically. The real provider's signing
// secret is a production concern (5.1E + secrets manager in 5.2A) and never
// lives in the codebase.
const MOCK_WEBHOOK_TOKEN = 'mock-signature';

export class MockProvider implements BillingProvider {
  readonly name = 'mock' as const;

  async createCustomer(
    _identity: ClinicBillingIdentity,
  ): Promise<{ external_customer_id: string }> {
    return { external_customer_id: `mock_cus_${randomUUID()}` };
  }

  async createSubscription(
    _external_customer_id: string,
    _plan_code: PlanCode,
  ): Promise<CreateSubscriptionResult> {
    return {
      external_subscription_id: `mock_sub_${randomUUID()}`,
      checkout_url: null,
    };
  }

  async cancelSubscription(_external_subscription_id: string): Promise<void> {
    // No-op in the mock — canonical cancellation happens in clinic_subscriptions.
  }

  async getSubscription(
    _external_subscription_id: string,
  ): Promise<{ external_status_raw: string }> {
    return { external_status_raw: 'active' };
  }

  verifyWebhookSignature(
    _rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): boolean {
    const sig = headers['x-mock-signature'];
    const value = Array.isArray(sig) ? sig[0] : sig;
    return value === MOCK_WEBHOOK_TOKEN;
  }

  parseWebhookEvent(rawBody: string): ParsedWebhookEvent {
    const parsed = JSON.parse(rawBody) as Partial<ParsedWebhookEvent>;
    if (typeof parsed.external_event_id !== 'string' || typeof parsed.type !== 'string') {
      throw new Error('mock webhook: missing external_event_id/type');
    }
    return {
      external_event_id: parsed.external_event_id,
      type: parsed.type,
      external_customer_id:
        typeof parsed.external_customer_id === 'string'
          ? parsed.external_customer_id
          : undefined,
      external_subscription_id:
        typeof parsed.external_subscription_id === 'string'
          ? parsed.external_subscription_id
          : undefined,
    };
  }
}

// Singleton — the foundation uses a single provider instance. The spike (5.1D)
// will select the active provider behind this same interface.
export const mockProvider = new MockProvider();
