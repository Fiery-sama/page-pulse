// ─── API Documentation Component ────────────────────────────────────────────
// Live API contract, curl snippets, rate limit specs, and error code reference.

import { Send } from 'lucide-react';

export default function ApiDocs() {
  return (
    <div>
      {/* ── POST /api/v1/audit ──────────────────────────────────────────── */}
      <div className="api-endpoint glass-card" style={{ marginBottom: 20 }}>
        <div>
          <span className="api-method method-post">POST</span>
          <span className="api-path">/api/v1/audit</span>
        </div>
        <p className="api-description">
          Submit a URL for comprehensive audit across SEO, Performance, Security, and Accessibility pillars.
        </p>

        <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '16px 0 8px' }}>
          Request Body
        </h4>
        <div className="code-block">
          <code>
{`{
  "url": "https://example.com",    // Required. HTTP or HTTPS URL.
  "bypassCache": false             // Optional. Skip cache lookup.
}`}
          </code>
        </div>

        <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '16px 0 8px' }}>
          Success Response (200)
        </h4>
        <div className="code-block">
          <code>
{`{
  "success": true,
  "cached": false,
  "data": {
    "url": "https://example.com",
    "grade": "B+",
    "overallScore": 87,
    "seo":           { "score": 85, "findings": [...] },
    "performance":   { "score": 95, "findings": [...] },
    "security":      { "score": 80, "findings": [...] },
    "accessibility": { "score": 90, "findings": [...] },
    "meta": {
      "fetchedAt": "2024-01-15T10:30:00.000Z",
      "ttfbMs": 145,
      "totalTimeMs": 823,
      "contentLengthBytes": 45230,
      "httpStatus": 200
    }
  }
}`}
          </code>
        </div>

        <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '16px 0 8px' }}>
          <Send size={14} style={{ display: 'inline', marginRight: 6 }} />
          curl Example
        </h4>
        <div className="code-block">
          <code>
{`curl -X POST http://localhost:3001/api/v1/audit \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com"}'`}
          </code>
        </div>
      </div>

      {/* ── GET /api/v1/audit ───────────────────────────────────────────── */}
      <div className="api-endpoint glass-card" style={{ marginBottom: 20 }}>
        <div>
          <span className="api-method method-get">GET</span>
          <span className="api-path">/api/v1/audit?url=…&bypassCache=true</span>
        </div>
        <p className="api-description">
          Same as POST, but accepts URL via query parameter. Useful for browser testing and curl one-liners.
        </p>
        <div className="code-block">
          <code>
{`curl "http://localhost:3001/api/v1/audit?url=https://example.com"`}
          </code>
        </div>
      </div>

      {/* ── Health & Stats ─────────────────────────────────────────────── */}
      <div className="api-endpoint glass-card" style={{ marginBottom: 20 }}>
        <div>
          <span className="api-method method-get">GET</span>
          <span className="api-path">/api/v1/health</span>
        </div>
        <p className="api-description">
          Returns service health status. Used by load balancers and uptime monitors.
        </p>
        <div className="code-block">
          <code>
{`{
  "success": true,
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600.5
}`}
          </code>
        </div>
      </div>

      <div className="api-endpoint glass-card" style={{ marginBottom: 20 }}>
        <div>
          <span className="api-method method-get">GET</span>
          <span className="api-path">/api/v1/stats</span>
        </div>
        <p className="api-description">
          Returns current audit concurrency statistics.
        </p>
        <div className="code-block">
          <code>
{`{
  "success": true,
  "concurrency": { "active": 3, "pending": 12 },
  "timestamp": "2024-01-15T10:30:00.000Z"
}`}
          </code>
        </div>
      </div>

      {/* ── Rate Limiting ──────────────────────────────────────────────── */}
      <div className="glass-card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: '1rem', marginBottom: 12 }}>⚡ Rate Limiting</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: 16 }}>
          The audit endpoint enforces a sliding-window rate limit per client IP or <code>X-API-Key</code> header.
        </p>
        <table className="adr-table">
          <thead>
            <tr>
              <th>Header</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code style={{ color: 'var(--cyan)' }}>X-RateLimit-Limit</code></td>
              <td>Maximum requests allowed in the window (default: 20)</td>
            </tr>
            <tr>
              <td><code style={{ color: 'var(--cyan)' }}>X-RateLimit-Remaining</code></td>
              <td>Remaining requests in the current window</td>
            </tr>
            <tr>
              <td><code style={{ color: 'var(--cyan)' }}>X-RateLimit-Reset</code></td>
              <td>Unix timestamp when the window resets</td>
            </tr>
            <tr>
              <td><code style={{ color: 'var(--cyan)' }}>Retry-After</code></td>
              <td>Seconds until the client can retry (only on 429)</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Error Codes ────────────────────────────────────────────────── */}
      <div className="glass-card">
        <h3 style={{ fontSize: '1rem', marginBottom: 12 }}>🚫 Error Codes</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: 16 }}>
          All errors return a structured JSON envelope:
        </p>
        <div className="code-block" style={{ marginBottom: 16 }}>
          <code>
{`{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "details": { ... },
    "timestamp": "2024-01-15T10:30:00.000Z",
    "requestId": "550e8400-e29b-41d4-a716-446655440000"
  }
}`}
          </code>
        </div>
        <table className="adr-table">
          <thead>
            <tr>
              <th>HTTP</th>
              <th>Code</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>400</td>
              <td><code style={{ color: 'var(--amber)' }}>VALIDATION_ERROR</code></td>
              <td>Invalid or missing URL, malformed request body</td>
            </tr>
            <tr>
              <td>403</td>
              <td><code style={{ color: 'var(--rose)' }}>SSRF_BLOCKED</code></td>
              <td>URL resolves to a restricted/private IP address</td>
            </tr>
            <tr>
              <td>429</td>
              <td><code style={{ color: 'var(--amber)' }}>RATE_LIMIT_EXCEEDED</code></td>
              <td>Client exceeded the request quota for the window</td>
            </tr>
            <tr>
              <td>502</td>
              <td><code style={{ color: 'var(--rose)' }}>FETCH_FAILED</code></td>
              <td>Target URL returned an error or was unreachable</td>
            </tr>
            <tr>
              <td>504</td>
              <td><code style={{ color: 'var(--rose)' }}>AUDIT_TIMEOUT</code></td>
              <td>Target URL did not respond within the configured timeout</td>
            </tr>
            <tr>
              <td>500</td>
              <td><code style={{ color: 'var(--rose)' }}>INTERNAL_ERROR</code></td>
              <td>Unexpected server error (logged for investigation)</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
