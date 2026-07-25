// ─── Sliding-Window Rate Limiter ────────────────────────────────────────────
// In-memory rate limiter keyed by client IP (or `X-API-Key` header if present).
// Emits standard rate-limit response headers and returns a structured 429
// when the quota is exceeded.
//
// Design note: the store interface is intentionally simple so it can be
// swapped for a Redis-backed implementation in a multi-node deployment.

import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { RateLimitError } from '../utils/errors.js';

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const store = new Map<string, TokenBucket>();

function getClientKey(req: Request): string {
  return (req.headers['x-api-key'] as string) || req.ip || 'unknown';
}

export function rateLimiterMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const key = getClientKey(req);
  const now = Date.now();
  const { rateLimitWindowMs, rateLimitMaxRequests } = config;

  let bucket = store.get(key);

  if (!bucket || now - bucket.lastRefill >= rateLimitWindowMs) {
    // First request or window expired – reset the bucket
    bucket = { tokens: rateLimitMaxRequests, lastRefill: now };
    store.set(key, bucket);
  }

  // Set informational headers
  const resetTimestamp = Math.ceil((bucket.lastRefill + rateLimitWindowMs) / 1000);
  res.setHeader('X-RateLimit-Limit', rateLimitMaxRequests);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, bucket.tokens - 1));
  res.setHeader('X-RateLimit-Reset', resetTimestamp);

  if (bucket.tokens <= 0) {
    const retryAfter = Math.ceil((bucket.lastRefill + rateLimitWindowMs - now) / 1000);
    res.setHeader('Retry-After', retryAfter);
    next(new RateLimitError(retryAfter));
    return;
  }

  bucket.tokens -= 1;
  next();
}

/** Reset all rate-limit state – useful in tests */
export function resetRateLimiter(): void {
  store.clear();
}
