import type { Request } from 'express';
import type { AuthContext } from '../services/authService';

// Captures the request metadata audit events need, without the service layer
// touching the HTTP request object directly.
export function buildAuthContext(req: Request): AuthContext {
  const ua = req.headers['user-agent'];
  return {
    ip: req.ip ?? null,
    user_agent: typeof ua === 'string' ? ua : null,
    request_id: req.requestId ?? null,
  };
}
