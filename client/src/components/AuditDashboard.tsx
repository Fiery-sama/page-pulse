// ─── Audit Dashboard Component ──────────────────────────────────────────────
// URL input bar, quick-test buttons, bypass-cache toggle, and live execution.

import { useState } from 'react';
import { Globe, Zap, AlertTriangle } from 'lucide-react';
import type { AuditResponse, ErrorResponse } from '../App';

interface Props {
  onComplete: (result: AuditResponse, requestId: string) => void;
  onError: (err: ErrorResponse) => void;
  error: ErrorResponse | null;
}

const QUICK_TESTS = [
  { label: 'example.com', url: 'https://example.com' },
  { label: 'github.com', url: 'https://github.com' },
  { label: 'wikipedia.org', url: 'https://en.wikipedia.org' },
  { label: 'google.com', url: 'https://www.google.com' },
];

export default function AuditDashboard({ onComplete, onError, error }: Props) {
  const [url, setUrl] = useState('');
  const [bypassCache, setBypassCache] = useState(false);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const runAudit = async (targetUrl: string) => {
    const trimmed = targetUrl.trim();
    if (!trimmed) return;

    setLoading(true);
    setLogs([]);
    addLog(`Starting audit for: ${trimmed}`);
    addLog(bypassCache ? 'Cache bypass: ON' : 'Cache bypass: OFF');

    try {
      addLog('Sending POST /api/v1/audit …');
      const start = performance.now();
      const res = await fetch('/api/v1/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed, bypassCache }),
      });

      const elapsed = Math.round(performance.now() - start);
      const requestId = res.headers.get('X-Request-ID') ?? '';
      const body = await res.json();

      if (!res.ok) {
        addLog(`❌ Error ${res.status}: ${body.error?.message ?? 'Unknown error'}`);
        onError(body as ErrorResponse);
        return;
      }

      addLog(`✅ Audit complete in ${elapsed}ms`);
      if (body.cached) {
        addLog(`📦 Cache HIT — cached at ${body.cachedAt}, expires in ${body.expiresInSeconds}s`);
      } else {
        addLog('🌐 Fresh audit (cache MISS)');
      }
      addLog(`📊 Overall score: ${body.data.overallScore}/100 (Grade ${body.data.grade})`);
      addLog(`⏱ TTFB: ${body.data.meta.ttfbMs}ms | Total: ${body.data.meta.totalTimeMs}ms`);

      onComplete(body as AuditResponse, requestId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addLog(`❌ Network error: ${message}`);
      onError({
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: `Failed to connect to the API server: ${message}`,
          timestamp: new Date().toISOString(),
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runAudit(url);
  };

  return (
    <div className="audit-input-section">
      {/* URL Input */}
      <div className="glass-card">
        <form onSubmit={handleSubmit}>
          <div className="url-input-bar">
            <div className="url-input-wrapper">
              <Globe />
              <input
                type="text"
                className="url-input"
                placeholder="Enter a URL to audit (e.g., https://example.com)"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !url.trim()}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  Auditing…
                </>
              ) : (
                <>
                  <Zap size={18} />
                  Audit
                </>
              )}
            </button>
          </div>
        </form>

        {/* Quick test buttons */}
        <div className="quick-tests">
          <span className="quick-tests-label">Quick test:</span>
          {QUICK_TESTS.map((t) => (
            <button
              key={t.url}
              className="quick-test-btn"
              onClick={() => {
                setUrl(t.url);
                runAudit(t.url);
              }}
              disabled={loading}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Options */}
        <div className="options-row">
          <label className="toggle-option" onClick={() => setBypassCache(!bypassCache)}>
            <div className={`toggle-switch ${bypassCache ? 'active' : ''}`} />
            Bypass cache
          </label>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="glass-card error-display" style={{ marginTop: 20 }}>
          <h3>
            <AlertTriangle size={20} />
            Audit Failed
          </h3>
          <p>{error.error.message}</p>
          <span className="error-code">{error.error.code}</span>
          {error.error.requestId && (
            <p style={{ marginTop: 8, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Request ID: {error.error.requestId}
            </p>
          )}
        </div>
      )}

      {/* Execution Logs */}
      {logs.length > 0 && (
        <div className="glass-card" style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: '0.9rem', marginBottom: 12, color: 'var(--text-secondary)' }}>
            Execution Log
          </h3>
          <div className="json-viewer">
            <pre>
              {logs.map((log, i) => (
                <div key={i}>{log}</div>
              ))}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
