// ─── Page Pulse – Integration Test Suite ────────────────────────────────────
// Comprehensive tests covering:
//   ✓ Successful audit of a valid public URL
//   ✓ Caching behaviour (second request returns cached result)
//   ✓ SSRF protection (blocking loopback, metadata, private IPs)
//   ✓ Rate limiting (exceeding quota triggers 429)
//   ✓ Request ID generation
//   ✓ Input validation (missing/malformed URL)
//   ✓ Structured error format

import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../src/index.js';
import { clearCache } from '../src/services/cacheService.js';
import { resetRateLimiter } from '../src/middleware/rateLimiter.js';

// Fresh app instance for testing
const app = createApp();
const request = supertest(app);

beforeEach(() => {
  clearCache();
  resetRateLimiter();
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function auditPost(url: string, bypassCache = false) {
  return request
    .post('/api/v1/audit')
    .send({ url, bypassCache })
    .set('Accept', 'application/json');
}

function auditGet(url: string) {
  return request.get(`/api/v1/audit?url=${encodeURIComponent(url)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Health & Meta
// ─────────────────────────────────────────────────────────────────────────────

describe('Health & Meta', () => {
  it('GET /api/v1/health returns 200 with healthy status', async () => {
    const res = await request.get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('healthy');
  });

  it('GET /api/v1/stats returns concurrency info', async () => {
    const res = await request.get('/api/v1/stats');
    expect(res.status).toBe(200);
    expect(res.body.concurrency).toBeDefined();
    expect(typeof res.body.concurrency.active).toBe('number');
    expect(typeof res.body.concurrency.pending).toBe('number');
  });

  it('GET / returns service info', async () => {
    const res = await request.get('/');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('Page Pulse');
  });

  it('returns 404 for unknown routes', async () => {
    const res = await request.get('/api/v1/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Request ID
// ─────────────────────────────────────────────────────────────────────────────

describe('Request ID', () => {
  it('generates X-Request-ID header on every response', async () => {
    const res = await request.get('/api/v1/health');
    const requestId = res.headers['x-request-id'];
    expect(requestId).toBeDefined();
    // Should look like a UUID
    expect(requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('echoes back a client-provided X-Request-ID', async () => {
    const customId = 'my-custom-request-id-123';
    const res = await request
      .get('/api/v1/health')
      .set('X-Request-ID', customId);
    expect(res.headers['x-request-id']).toBe(customId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Input Validation
// ─────────────────────────────────────────────────────────────────────────────

describe('Input Validation', () => {
  it('rejects missing URL', async () => {
    const res = await request.post('/api/v1/audit').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects empty string URL', async () => {
    const res = await auditPost('');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects malformed URL', async () => {
    const res = await auditPost('not-a-valid-url');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects ftp:// protocol', async () => {
    const res = await auditPost('ftp://example.com/file.txt');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns structured error envelope on validation failure', async () => {
    const res = await auditPost('');
    expect(res.body).toHaveProperty('success', false);
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('message');
    expect(res.body.error).toHaveProperty('timestamp');
    expect(res.body.error).toHaveProperty('requestId');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. SSRF Protection
// ─────────────────────────────────────────────────────────────────────────────

describe('SSRF Protection', () => {
  it('blocks http://127.0.0.1', async () => {
    const res = await auditPost('http://127.0.0.1');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SSRF_BLOCKED');
  });

  it('blocks http://localhost', async () => {
    const res = await auditPost('http://localhost');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SSRF_BLOCKED');
  });

  it('blocks http://169.254.169.254 (cloud metadata)', async () => {
    const res = await auditPost('http://169.254.169.254');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SSRF_BLOCKED');
  });

  it('blocks http://10.0.0.1 (private network)', async () => {
    const res = await auditPost('http://10.0.0.1');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SSRF_BLOCKED');
  });

  it('blocks http://192.168.1.1 (private network)', async () => {
    const res = await auditPost('http://192.168.1.1');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SSRF_BLOCKED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Successful Audit
// ─────────────────────────────────────────────────────────────────────────────

describe('Successful Audit', () => {
  it('audits a valid public URL via POST and returns structured report', async () => {
    const res = await auditPost('https://example.com');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.cached).toBe(false);
    expect(res.body.data).toBeDefined();

    const data = res.body.data;
    expect(data.url).toBe('https://example.com');
    expect(data.grade).toBeDefined();
    expect(typeof data.overallScore).toBe('number');
    expect(data.overallScore).toBeGreaterThanOrEqual(0);
    expect(data.overallScore).toBeLessThanOrEqual(100);

    // Four pillars
    for (const pillar of ['seo', 'performance', 'security', 'accessibility'] as const) {
      expect(data[pillar]).toBeDefined();
      expect(typeof data[pillar].score).toBe('number');
      expect(Array.isArray(data[pillar].findings)).toBe(true);
    }

    // Meta
    expect(data.meta).toBeDefined();
    expect(typeof data.meta.ttfbMs).toBe('number');
    expect(typeof data.meta.totalTimeMs).toBe('number');
    expect(typeof data.meta.contentLengthBytes).toBe('number');
    expect(data.meta.httpStatus).toBe(200);
  }, 15000);

  it('audits a valid public URL via GET query parameter', async () => {
    const res = await auditGet('https://example.com');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.url).toBe('https://example.com');
  }, 15000);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Caching Behaviour
// ─────────────────────────────────────────────────────────────────────────────

describe('Caching', () => {
  it('returns cached result on second request within TTL', async () => {
    const url = 'https://example.com';

    // First request – should not be cached
    const first = await auditPost(url);
    expect(first.status).toBe(200);
    expect(first.body.cached).toBe(false);

    // Second request – should be cached
    const second = await auditPost(url);
    expect(second.status).toBe(200);
    expect(second.body.cached).toBe(true);
    expect(second.body.cachedAt).toBeDefined();
    expect(typeof second.body.expiresInSeconds).toBe('number');
    expect(second.body.expiresInSeconds).toBeGreaterThan(0);

    // Data should be identical
    expect(second.body.data.url).toBe(url);
    expect(second.body.data.overallScore).toBe(first.body.data.overallScore);
  }, 20000);

  it('bypasses cache when bypassCache=true', async () => {
    const url = 'https://example.com';

    // Populate cache
    await auditPost(url);

    // Bypass cache
    const res = await auditPost(url, true);
    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(false);
  }, 20000);
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Rate Limiting
// ─────────────────────────────────────────────────────────────────────────────

describe('Rate Limiting', () => {
  it('returns rate-limit headers on every audited request', async () => {
    const res = await auditPost('https://example.com');
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.headers['x-ratelimit-reset']).toBeDefined();
  }, 15000);

  it('returns 429 when rate limit is exceeded', async () => {
    // Override config: allow only 3 requests in the window for this test
    const { config } = await import('../src/config.js');
    const originalMax = config.rateLimitMaxRequests;
    (config as { rateLimitMaxRequests: number }).rateLimitMaxRequests = 3;

    try {
      // Exhaust the quota with fast SSRF-blocked requests (no real network needed)
      for (let i = 0; i < 3; i++) {
        await auditPost('http://127.0.0.1');
      }

      // 4th request should be throttled
      const res = await auditPost('http://127.0.0.1');
      expect(res.status).toBe(429);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(res.headers['retry-after']).toBeDefined();
    } finally {
      (config as { rateLimitMaxRequests: number }).rateLimitMaxRequests = originalMax;
    }
  });
});
