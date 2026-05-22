import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { createRateLimitStore } from '../config/rateLimitStore';

// Scoped rate limit for /auth/*. Tuned via env (AUTH_RATE_LIMIT_WINDOW_MS,
// AUTH_RATE_LIMIT_MAX). Mitigates STRIDE: Denial of Service / Spoofing — see
// master doc section 6.6 and US-16 in the backlog.
//
// Sprint 3.2: uses the shared store factory (memory by default, Redis when
// RATE_LIMIT_STORE=redis) so the limit holds across multiple app instances.
export const authRateLimit = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: createRateLimitStore('auth'),
  // Generic message — never reveal whether the limited request would have
  // succeeded, and never echo back caller input.
  message: {
    error: {
      code: 'rate_limited',
      message: 'Muitas requisições. Aguarde alguns minutos e tente novamente.',
    },
  },
});
