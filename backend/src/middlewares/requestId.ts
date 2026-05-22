import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

const HEADER_NAME = 'X-Request-Id';

// Accept a narrow alphabet only: alphanumeric, dashes, underscores, length 8..64.
// This guards against header injection (CR/LF) and log poisoning when the id is
// echoed back in logs or in the response header.
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

function pickIncoming(req: Request): string | null {
  const raw = req.headers['x-request-id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  return SAFE_REQUEST_ID.test(value) ? value : null;
}

export const requestId: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const incoming = pickIncoming(req);
  req.requestId = incoming ?? randomUUID();
  res.setHeader(HEADER_NAME, req.requestId);
  next();
};
