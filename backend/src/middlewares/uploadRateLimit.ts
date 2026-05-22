import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { createRateLimitStore } from '../config/rateLimitStore';

// Scoped rate limit for file uploads (POST /import-files/upload). Tuned via env
// (UPLOAD_RATE_LIMIT_WINDOW_MS, UPLOAD_RATE_LIMIT_MAX). Mitigates DoS via large /
// repeated uploads (master doc 6.5 / US-16). Intentionally separate from the
// /auth limiter so upload abuse never throttles login, and vice versa.
// Sprint 3.2: uses the shared store factory (memory default / Redis optional).
export const uploadRateLimit = rateLimit({
  windowMs: env.UPLOAD_RATE_LIMIT_WINDOW_MS,
  limit: env.UPLOAD_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: createRateLimitStore('upload'),
  message: {
    error: {
      code: 'rate_limited',
      message: 'Muitos envios. Aguarde alguns minutos e tente novamente.',
    },
  },
});
