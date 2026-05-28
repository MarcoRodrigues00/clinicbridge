import type { PlanCode } from '../types/db';

// Payment-provider abstraction — Sprint 5.1B (ADR 0018 §13).
//
// The business logic (states, entitlements, soft-lock, idempotency) lives in
// the ClinicBridge backend, NOT in the provider. Swapping gateways swaps only
// the adapter. v0.1 ships `MockProvider`; the real gateway is decided in the
// spike (5.1D).
//
// PII MINIMIZATION (ADR 0018 §9): only the clinic's BILLING identity is ever
// passed to a provider — clinic name, billing email, and the financial
// responsible's CPF/CNPJ (a SaaS-customer datum, NOT patient data). NO patient
// PII and NO clinical content ever reach a provider, ever.

export interface ClinicBillingIdentity {
  clinic_name: string;
  billing_email: string;
  // CPF/CNPJ of the clinic's financial responsible (SaaS customer), or null.
  // NEVER a patient document.
  tax_id: string | null;
}

export interface CreateSubscriptionResult {
  external_subscription_id: string;
  // Hosted checkout URL when the provider offers one (null for mock).
  checkout_url: string | null;
}

// Normalized shape parsed out of a raw webhook body. The tenant is resolved
// INTERNALLY from external_customer_id / external_subscription_id via the
// provider maps — a webhook NEVER asserts its own clinica_id (anti-spoofing).
export interface ParsedWebhookEvent {
  external_event_id: string;
  type: string;
  external_customer_id?: string;
  external_subscription_id?: string;
}

export interface BillingProvider {
  readonly name: 'mock' | 'manual' | 'asaas' | 'stripe';

  createCustomer(
    identity: ClinicBillingIdentity,
  ): Promise<{ external_customer_id: string }>;

  createSubscription(
    external_customer_id: string,
    plan_code: PlanCode,
  ): Promise<CreateSubscriptionResult>;

  cancelSubscription(external_subscription_id: string): Promise<void>;

  getSubscription(
    external_subscription_id: string,
  ): Promise<{ external_status_raw: string }>;

  // Webhook verification + parsing — wired to a route only in a later sprint
  // (5.1E). Defined here so the architecture is complete and testable now.
  verifyWebhookSignature(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): boolean;

  parseWebhookEvent(rawBody: string): ParsedWebhookEvent;

  // Optional customer portal (Stripe-style). Undefined when unsupported.
  getCustomerPortalUrl?(external_customer_id: string): Promise<string | null>;
}
