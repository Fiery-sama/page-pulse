// ─── Global Error Handler ───────────────────────────────────────────────────
// Express "catch-all" error middleware.  Converts any thrown Error (including
// our custom AppError hierarchy) into a standardised JSON envelope and logs
// the incident at the appropriate severity level.

import type { Request, Response, NextFunction } from 'express';
import { AppError, buildErrorResponse } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export function errorHandlerMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.id;

  if (err instanceof AppError) {
    // Expected operational errors – log at warn level
    logger.warn(
      { requestId, code: err.code, statusCode: err.statusCode, details: err.details },
      err.message,
    );

    const body = buildErrorResponse(err.code, err.message, requestId, err.details);
    res.status(err.statusCode).json(body);
    return;
  }

  // Unexpected / programmer errors – log the full stack at error level
  logger.error({ requestId, err }, 'Unhandled internal error');

  const body = buildErrorResponse(
    'INTERNAL_ERROR',
    'An unexpected internal error occurred',
    requestId,
  );
  res.status(500).json(body);
}
