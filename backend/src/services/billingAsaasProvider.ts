import { timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';
import { logger } from '../config/logger';
import type { PlanCode } from '../types/db';
import type {
  BillingProvider,
  ClinicBillingIdentity,
  CreateSubscriptionResult,
  ParsedWebhookEvent,
} from './billingProvider';

// Asaas SANDBOX adapter — Sprint 5.1E (ADR 0018 §13).
//
// Implements the existing `BillingProvider` abstraction with NO interface
// change. The business logic (states, entitlements, soft-lock, idempotency)
// stays in the ClinicBridge backend; this adapter only talks to the Asaas
// SANDBOX REST API and normalizes its webhook envelope.
//
// HARD INVARIANTS (this sprint):
//   - SANDBOX ONLY. The base URL is hardcoded to the sandbox host; outbound
//     calls refuse unless ASAAS_ENV=sandbox. A real gateway is forbidden until
//     the production-security ADR (5.2A) — env.ts also fails prod boot if
//     ASAAS_ENV !== 'disabled'.
//   - SECRETS ONLY FROM ENV. The API key and webhook token are read from env,
//     NEVER committed, NEVER logged (no header/body/key ever reaches the logger;
//     logger.ts also redacts them defensively).
//   - NO PATIENT PII. Only the clinic billing identity (name, billing email,
//     responsible's CPF/CNPJ) is ever sent — never patient data (ADR 0018 §9).
//   - WEBHOOK VERIFICATION IS A SHARED-SECRET TOKEN, *NOT* AN HMAC. Asaas sends
//     the configured token in the `asaas-access-token` header; we compare it in
//     constant time. It proves origin (knows the secret) but NOT payload
//     integrity — mitigated by HTTPS + idempotency + internal tenant resolution
//     (ADR 0018 §8/§10).

// Sandbox host is hardcoded on purpose — an env-configurable base URL would be a
// footgun (could point a "sandbox" build at production). Asaas sandbox base:
const ASAAS_SANDBOX_BASE_URL = 'https://api-sandbox.asaas.com/v3';

export function isAsaasSandboxEnabled(): boolean {
  return env.ASAAS_ENV === 'sandbox';
}

// Constant-time string compare. Returns false (without leaking length via an
// early return on the compare itself) when lengths differ. Pure + exported so it
// is unit-testable without env (scripts/billing-admin.ts asaas:selftest).
export function verifyAsaasToken(
  provided: string | undefined,
  expected: string | undefined,
): boolean {
  if (typeof expected !== 'string' || expected.length === 0) return false;
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    // Keep the comparison cost roughly constant, then reject.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

interface AsaasIdResponse {
  id: string;
}

interface AsaasSubscriptionResponse {
  id: string;
  status?: string;
}

export class AsaasProvider implements BillingProvider {
  readonly name = 'asaas' as const;

  // Single private HTTP helper. NEVER logs the api key, headers, or body — only
  // the HTTP status and the (secret-free) path on failure.
  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    if (!isAsaasSandboxEnabled()) {
      throw new Error('asaas_not_configured: ASAAS_ENV is not "sandbox"');
    }
    const apiKey = env.ASAAS_API_KEY;
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error('asaas_not_configured: missing ASAAS_API_KEY');
    }
    const res = await fetch(`${ASAAS_SANDBOX_BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        access_token: apiKey,
        'User-Agent': 'clinicbridge-sandbox',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      // Secret-free diagnostics only: status + path. Never the key/headers/body.
      logger.warn({ asaas_status: res.status, path }, 'asaas sandbox request failed');
      throw new Error(`asaas sandbox request failed: HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  }

  async createCustomer(
    identity: ClinicBillingIdentity,
  ): Promise<{ external_customer_id: string }> {
    // Only the clinic billing identity — NEVER patient PII (ADR 0018 §9).
    const data = await this.request<AsaasIdResponse>('POST', '/customers', {
      name: identity.clinic_name,
      email: identity.billing_email,
      cpfCnpj: identity.tax_id ?? undefined,
    });
    return { external_customer_id: data.id };
  }

  async createSubscription(
    external_customer_id: string,
    plan_code: PlanCode,
  ): Promise<CreateSubscriptionResult> {
    // Sandbox PLACEHOLDER values. Real prices are a future commercial decision
    // (ADR 0018 §4) and this sprint disburses NO real money — the value/cycle/
    // billingType here only exist to exercise the sandbox subscription API.
    const nextDueDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const data = await this.request<AsaasIdResponse>('POST', '/subscriptions', {
      customer: external_customer_id,
      billingType: 'BOLETO', // sandbox-simplest; no Pix key/card vault needed
      cycle: 'MONTHLY',
      value: 1, // R$1 sandbox placeholder — NEVER a real price
      nextDueDate,
      description: `ClinicBridge sandbox subscription (${plan_code})`,
    });
    // Asaas returns the subscription; a hosted checkout/payment link is a
    // separate call ([VERIFICAR] payer portal) — null for now.
    return { external_subscription_id: data.id, checkout_url: null };
  }

  async cancelSubscription(external_subscription_id: string): Promise<void> {
    await this.request<{ deleted: boolean }>(
      'DELETE',
      `/subscriptions/${encodeURIComponent(external_subscription_id)}`,
    );
  }

  async getSubscription(
    external_subscription_id: string,
  ): Promise<{ external_status_raw: string }> {
    const data = await this.request<AsaasSubscriptionResponse>(
      'GET',
      `/subscriptions/${encodeURIComponent(external_subscription_id)}`,
    );
    return { external_status_raw: data.status ?? 'unknown' };
  }

  // Shared-secret token check (NOT an HMAC). rawBody is unused because Asaas
  // does not sign the body — origin is proven by the `asaas-access-token` header.
  verifyWebhookSignature(
    _rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): boolean {
    const raw = headers['asaas-access-token'];
    const got = Array.isArray(raw) ? raw[0] : raw;
    return verifyAsaasToken(typeof got === 'string' ? got : undefined, env.ASAAS_WEBHOOK_TOKEN);
  }

  // Normalize the Asaas webhook envelope. Asaas events are CHARGE-centric:
  //   { id: "evt_...", event: "PAYMENT_RECEIVED", payment: { id, customer,
  //     subscription, status, ... } }
  // We extract the stable event id (idempotency key) + the customer/subscription
  // ids used for INTERNAL tenant resolution. The tenant is NEVER taken from the
  // payload directly. [VERIFICAR] confirm the event-id field name + payment
  // sub-fields against real sandbox payloads.
  parseWebhookEvent(rawBody: string): ParsedWebhookEvent {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      throw new Error('asaas webhook: invalid JSON body');
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('asaas webhook: body is not an object');
    }
    const obj = parsed as Record<string, unknown>;
    const eventId = typeof obj.id === 'string' ? obj.id : undefined;
    const type = typeof obj.event === 'string' ? obj.event : undefined;
    if (!eventId || !type) {
      throw new Error('asaas webhook: missing id/event');
    }
    const payment =
      typeof obj.payment === 'object' && obj.payment !== null
        ? (obj.payment as Record<string, unknown>)
        : undefined;
    const external_customer_id =
      payment && typeof payment.customer === 'string' ? payment.customer : undefined;
    const external_subscription_id =
      payment && typeof payment.subscription === 'string' ? payment.subscription : undefined;
    return { external_event_id: eventId, type, external_customer_id, external_subscription_id };
  }
}

// Singleton, mirroring `mockProvider`. The webhook service uses this instance.
export const asaasProvider = new AsaasProvider();
