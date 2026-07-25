// ─── Audit API Router ───────────────────────────────────────────────────────
// Defines the REST endpoints for the Page Pulse audit service:
//   POST /api/v1/audit       – run a URL audit (body: { url })
//   GET  /api/v1/audit?url=  – run a URL audit (query parameter)
//   GET  /api/v1/health      – health check
//   GET  /api/v1/stats       – service statistics

import { Router } from 'express';
import { validateUrl } from '../services/validator.js';
import { getFromCache, setInCache } from '../services/cacheService.js';
import { runAudit } from '../services/auditService.js';
import { activeCount, pendingCount } from '../services/concurrencyLimiter.js';
import { rateLimiterMiddleware } from '../middleware/rateLimiter.js';
import { logger } from '../utils/logger.js';

export const auditRouter = Router();

// ── Health ──────────────────────────────────────────────────────────────────

auditRouter.get('/health', (_req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ── Stats ───────────────────────────────────────────────────────────────────

auditRouter.get('/stats', (_req, res) => {
  res.json({
    success: true,
    concurrency: {
      active: activeCount(),
      pending: pendingCount(),
    },
    timestamp: new Date().toISOString(),
  });
});

// ── Audit endpoint ──────────────────────────────────────────────────────────

async function handleAudit(
  rawUrl: unknown,
  bypassCache: boolean,
  requestId: string,
) {
  // 1) Validate URL + SSRF check
  const { raw: url } = await validateUrl(rawUrl);

  // 2) Cache lookup (unless bypass requested)
  if (!bypassCache) {
    const cached = getFromCache(url);
    if (cached) {
      logger.info({ requestId, url }, 'Cache hit');
      return {
        success: true as const,
        cached: true,
        cachedAt: cached.cachedAt,
        expiresInSeconds: cached.expiresInSeconds,
        data: cached.report,
      };
    }
  }

  // 3) Run fresh audit (concurrency-limited + timeout-enforced)
  logger.info({ requestId, url }, 'Starting fresh audit');
  const report = await runAudit(url);

  // 4) Populate cache
  setInCache(url, report);

  return {
    success: true as const,
    cached: false,
    data: report,
  };
}

// POST /api/v1/audit  (body: { url, bypassCache? })
auditRouter.post('/audit', rateLimiterMiddleware, async (req, res, next) => {
  try {
    const { url, bypassCache = false } = req.body ?? {};
    const result = await handleAudit(url, !!bypassCache, String(req.id ?? ''));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/audit?url=…&bypassCache=true
auditRouter.get('/audit', rateLimiterMiddleware, async (req, res, next) => {
  try {
    const { url, bypassCache } = req.query;
    const result = await handleAudit(url, bypassCache === 'true', String(req.id ?? ''));
    res.json(result);
  } catch (err) {
    next(err);
  }
});
