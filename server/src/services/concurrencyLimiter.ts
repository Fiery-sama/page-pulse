// ─── Concurrency Limiter ────────────────────────────────────────────────────
// Wraps `p-limit` to bound the number of in-flight outgoing HTTP fetches.
// This prevents the server from exhausting sockets or overwhelming target
// hosts when many audit requests arrive simultaneously.

import pLimit from 'p-limit';
import { config } from '../config.js';

const limit = pLimit(config.maxConcurrentAudits);

/**
 * Schedule `fn` to run once a concurrency slot is available.
 * At most `config.maxConcurrentAudits` functions run in parallel.
 */
export function withConcurrencyLimit<T>(fn: () => Promise<T>): Promise<T> {
  return limit(fn);
}

/** Current number of in-flight tasks */
export function pendingCount(): number {
  return limit.pendingCount;
}

/** Current number of actively running tasks */
export function activeCount(): number {
  return limit.activeCount;
}
