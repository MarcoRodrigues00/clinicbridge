import { createHash } from 'node:crypto';
import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import { billingEventDao } from '../dao/billingEventDao';
import { billingProviderCustomerDao } from '../dao/billingProviderCustomerDao';
import { billingProviderSubscriptionDao } from '../dao/billingProviderSubscriptionDao';
import { HttpError } from '../middlewares/errorHandler';
import type { SubscriptionStatus } from '../types/db';
import type { AuthContext } from './authService';
import { asaasProvider, isAsaasSandboxEnabled } from './billingAsaasProvider';
import { mapAsaasEventToInternalStatus } from './billingAsaasMapping';

// Billing webhook service — Sprint 5.1E (ADR 0018 §6/§8/§10).
//
// Processes inbound provider webhooks for the COMMERCIAL layer (the SaaS billing
// the clinic) — NEVER the clinic's financial module (ADR 0012). Kept SEPARATE
// from billingService.ts so the read/status service is untouched.
//
// SECURITY POSTURE (all enforced here):
//   - SANDBOX-GATED: refuses (404) unless ASAAS_ENV=sandbox.
//   - VERIFY FIRST: the shared-secret token is checked before ANY processing.
//     A failed check is audited (billing.webhook.rejected) and 401'd.
//   - IDEMPOTENT: every event is recorded by UNIQUE(provider, external_event_id);
//     a duplicate delivery is a fast no-op (200).
//   - TENANT BY INTERNAL MAP ONLY: clinica_id is resolved from
//     billing_provider_subscriptions / billing_provider_customers, NEVER from
//     the payload (anti-spoofing). An unmapped event is recorded as `ignored`
//     with clinica_id=null and leaks nothing.
//   - METADATA-ONLY: we store a payload_hash, never the raw payload (which may
//     carry the responsible's PII); audit rows are metadata-only.
//
// v0.1 SCOPE NOTE: this RECORDS the verified event and COMPUTES the intended
// internal status, but DOES NOT mutate the subscription or toggle soft-lock.
// Applying transitions from a webhook is a later sprint with its own review
// (ADR 0018 §6/§7) — 5.1E proves verify + parse + idempotency + tenant
// resolution end-to-end in sandbox, nothing more.

export type WebhookOutcome = 'duplicate' | 'recorded' | 'ignored_unmapped';

export interface WebhookResult {
  outcome: WebhookOutcome;
  // Intended internal status for diagnostics only — NOT applied in 5.1E.
  mapped_status: SubscriptionStatus | null;
}

// Withdrawal-validation decision for the Asaas SANDBOX endpoint. v0.1 ALWAYS
// denies (default-deny) — ClinicBridge never auto-approves moving money in this
// sprint. `status: 'REFUSED'` + `refuseReason` is the documented Asaas contract
// for refusing a withdrawal; the final end-to-end behavior is still to be
// confirmed against a real sandbox account.
export type WithdrawalDecision = 'REFUSED';

export interface WithdrawalValidationResult {
  status: WithdrawalDecision;
  refuseReason: string;
}

// Best-effort, metadata-only audit. Never blocks the webhook; never logs PII or
// secrets (acao + ids only).
async function safeAudit(
  acao: string,
  clinica_id: string | null,
  recurso_id: string | null,
  ctx: AuthContext,
): Promise<void> {
  try {
    await auditLogDao.create({
      acao,
      usuario_id: null, // webhooks have no authenticated user
      clinica_id,
      recurso: 'billing_webhook',
      recurso_id,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
    });
  } catch (err) {
    logger.error({ err, acao, audit_write_failed: true }, 'billing webhook audit write failed');
  }
}

export const billingWebhookService = {
  // Process an Asaas SANDBOX webhook. `rawBody` is the request body as a string
  // (Asaas verification is header-token based, not a body HMAC, so re-serialized
  // JSON is acceptable). Throws HttpError for gate/verify/parse failures; the
  // caller responds 200 on any handled outcome so the provider does not retry a
  // known no-op.
  async processAsaasSandbox(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
    ctx: AuthContext,
  ): Promise<WebhookResult> {
    if (!isAsaasSandboxEnabled()) {
      // Do not reveal the route exists when the sandbox is off.
      throw new HttpError(404, 'not_found', 'Resource not found.');
    }

    if (!asaasProvider.verifyWebhookSignature(rawBody, headers)) {
      await safeAudit('billing.webhook.rejected', null, null, ctx);
      throw new HttpError(401, 'unauthorized', 'Webhook não autorizado.');
    }

    let parsed;
    try {
      parsed = asaasProvider.parseWebhookEvent(rawBody);
    } catch {
      // Never echo the payload back; generic code.
      throw new HttpError(400, 'billing_webhook_invalid', 'Evento de webhook inválido.');
    }

    // Resolve the tenant ONLY via the trusted internal maps. Subscription map
    // first (most specific), then customer map. Never trust the payload.
    let clinica_id: string | null = null;
    if (parsed.external_subscription_id) {
      const row = await billingProviderSubscriptionDao.findByExternalId(
        'asaas',
        parsed.external_subscription_id,
      );
      clinica_id = row?.clinica_id ?? null;
    }
    if (!clinica_id && parsed.external_customer_id) {
      const row = await billingProviderCustomerDao.findByExternalId(
        'asaas',
        parsed.external_customer_id,
      );
      clinica_id = row?.clinica_id ?? null;
    }

    // Hash of OUR serialized body — metadata only, never the raw payload.
    const payload_hash = createHash('sha256').update(rawBody).digest('hex');

    const recorded = await billingEventDao.recordIfNew({
      provider: 'asaas',
      external_event_id: parsed.external_event_id,
      event_type: parsed.type,
      clinica_id,
      payload_hash,
    });

    if (!recorded) {
      // Duplicate delivery (same provider + external_event_id) → no-op.
      return { outcome: 'duplicate', mapped_status: null };
    }

    if (!clinica_id) {
      // Verified but no internal mapping → record as ignored, change nothing.
      await billingEventDao.markStatus(recorded.id, 'ignored');
      await safeAudit('billing.webhook.received', null, recorded.id, ctx);
      return { outcome: 'ignored_unmapped', mapped_status: null };
    }

    const mapped_status = mapAsaasEventToInternalStatus(parsed.type);
    await billingEventDao.markStatus(recorded.id, 'processed');
    await safeAudit('billing.webhook.received', clinica_id, recorded.id, ctx);
    return { outcome: 'recorded', mapped_status };
  },

  // Asaas SANDBOX withdrawal-validation hook — Sprint 5.1E (ADR 0018 §8/§10).
  //
  // Asaas can call back an external endpoint to AUTHORIZE a withdrawal/transfer
  // before it moves money. This v0.1 implementation is intentionally minimal and
  // DEFAULT-DENY: it proves the gate + shared-secret token check end-to-end and
  // then REFUSES every request — ClinicBridge never auto-approves a withdrawal in
  // this sprint. Auto-approval logic (if ever) needs its own ADR review.
  //
  // SECURITY POSTURE (mirrors the inbound webhook):
  //   - SANDBOX-GATED: 404 unless ASAAS_ENV=sandbox (route is inert by default).
  //   - VERIFY FIRST: shared-secret `asaas-access-token` checked in constant time
  //     BEFORE anything else; a failed check is audited and 401'd.
  //   - METADATA-ONLY: the request body is NEVER parsed, hashed, stored, or
  //     logged (a withdrawal payload may carry the responsible's PII / bank data).
  //   - TOUCHES NOTHING: no billingService, no subscription/soft-lock mutation, no
  //     clinic financial module, no patients. Audit row is metadata-only.
  async validateAsaasSandboxWithdrawal(
    headers: Record<string, string | string[] | undefined>,
    ctx: AuthContext,
  ): Promise<WithdrawalValidationResult> {
    if (!isAsaasSandboxEnabled()) {
      // Do not reveal the route exists when the sandbox is off.
      throw new HttpError(404, 'not_found', 'Resource not found.');
    }

    // rawBody is unused by the Asaas token check (origin is proven by the header,
    // not a body HMAC), so we never touch/serialize the payload here.
    if (!asaasProvider.verifyWebhookSignature('', headers)) {
      await safeAudit('billing.withdrawal.rejected', null, null, ctx);
      throw new HttpError(401, 'unauthorized', 'Webhook não autorizado.');
    }

    // Default-deny. Record the (verified) decision as metadata only.
    await safeAudit('billing.withdrawal.denied', null, null, ctx);
    return {
      status: 'REFUSED',
      refuseReason: 'ClinicBridge sandbox v0.1 does not approve withdrawals automatically',
    };
  },
};
