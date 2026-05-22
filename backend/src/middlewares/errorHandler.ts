import type { ErrorRequestHandler, Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

export class HttpError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFoundHandler = (_req: Request, res: Response): void => {
  res.status(404).json({ error: { code: 'not_found', message: 'Resource not found.' } });
};

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (err instanceof HttpError) {
    logger.warn({ status: err.status, code: err.code }, 'handled http error');
    const body: Record<string, unknown> = { error: { code: err.code, message: err.message } };
    if (err.details !== undefined) {
      (body.error as Record<string, unknown>).details = err.details;
    }
    res.status(err.status).json(body);
    return;
  }

  logger.error({ err }, 'unhandled error');
  res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error.' } });
};
