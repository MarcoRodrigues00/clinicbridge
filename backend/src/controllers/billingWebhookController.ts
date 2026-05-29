import type { Request, Response } from 'express';
import { billingWebhookService } from '../services/billingWebhookService';
import { buildAuthContext } from '../utils/authContext';

// Billing webhook controller — Sprint 5.1E (ADR 0018).
//
// The webhook is NOT authenticated by JWT; the provider proves origin with the
// shared `asaas-access-token` header, verified inside the service. The route is
// IP-rate-limited and SANDBOX-gated (the service 404s unless ASAAS_ENV=sandbox).
export const billingWebhookController = {
  // POST /billing/webhooks/asaas/sandbox
  async asaasSandbox(req: Request, res: Response): Promise<void> {
    const ctx = buildAuthContext(req);
    // Body is already JSON-parsed by the global express.json(). Asaas verifies
    // by header token (not a body HMAC), so re-serializing is safe; the real
    // idempotency key is the event id, not the byte stream.
    const rawBody = JSON.stringify(req.body ?? {});
    const result = await billingWebhookService.processAsaasSandbox(rawBody, req.headers, ctx);
    // 200 on any handled outcome (recorded / duplicate / ignored) so the
    // provider does not retry a known no-op. Verify/parse failures throw and
    // surface as 401/400 via the central error handler.
    res.status(200).json({ received: true, outcome: result.outcome });
  },

  // POST /billing/webhooks/asaas/sandbox/withdrawal-validation
  //
  // SANDBOX-only withdrawal authorization callback. The body is intentionally
  // NOT read (metadata-only; default-deny). Origin is proven by the
  // `asaas-access-token` header, verified inside the service.
  async asaasSandboxWithdrawalValidation(req: Request, res: Response): Promise<void> {
    const ctx = buildAuthContext(req);
    const result = await billingWebhookService.validateAsaasSandboxWithdrawal(req.headers, ctx);
    // 200 with the minimal decision shape; v0.1 always REFUSES. Gate/verify
    // failures throw and surface as 404/401 via the central error handler.
    res.status(200).json(result);
  },
};
