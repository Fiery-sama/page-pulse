// ─── TTL-Based In-Memory Cache ──────────────────────────────────────────────
// Stores audit results keyed by URL for `config.cacheTtlSeconds`.
// Exposes `cachedAt` and remaining TTL so the API response can surface
// cache metadata to the consumer.
//
// Design note: the interface is intentionally narrow so it can be backed
// by Redis or Memcached in a multi-process deployment without changing the
// consumer code.

import { config } from '../config.js';
import type { AuditReport } from './auditService.js';

interface CacheEntry {
  report: AuditReport;
  cachedAt: number; // epoch ms
}

const store = new Map<string, CacheEntry>();

export interface CacheHit {
  report: AuditReport;
  cachedAt: string;        // ISO-8601
  expiresInSeconds: number;
}

/**
 * Attempt to retrieve a cached audit report for the given URL.
 * Returns `null` if not cached or expired.
 */
export function getFromCache(url: string): CacheHit | null {
  const entry = store.get(url);
  if (!entry) return null;

  const ageMs = Date.now() - entry.cachedAt;
  const ttlMs = config.cacheTtlSeconds * 1000;

  if (ageMs >= ttlMs) {
    store.delete(url);
    return null;
  }

  return {
    report: entry.report,
    cachedAt: new Date(entry.cachedAt).toISOString(),
    expiresInSeconds: Math.ceil((ttlMs - ageMs) / 1000),
  };
}

/**
 * Store an audit report in the cache.
 */
export function setInCache(url: string, report: AuditReport): void {
  store.set(url, { report, cachedAt: Date.now() });
}

/** Clear the entire cache – useful in tests */
export function clearCache(): void {
  store.clear();
}
