// ─── Request ID Middleware ───────────────────────────────────────────────────
// Assigns a UUIDv4 to every incoming request and propagates it via the
// `X-Request-ID` response header for end-to-end traceability.

import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Unique request identifier (UUIDv4) */
      id: string;
    }
  }
}

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const id = (req.headers['x-request-id'] as string) || uuidv4();
  req.id = id;
  res.setHeader('X-Request-ID', id);
  next();
}
