// ─── Page Pulse Configuration ───────────────────────────────────────────────
// All runtime parameters are sourced from environment variables with
// production-safe defaults.  Override via `.env` or CI secrets.

export const config = {
  /** Server listening port */
  port: parseInt(process.env.PORT ?? '3001', 10),

  /** Cache time-to-live in seconds (0 = disabled) */
  cacheTtlSeconds: parseInt(process.env.CACHE_TTL_SECONDS ?? '60', 10),

  /** Rate-limit window duration in milliseconds */
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10),

  /** Maximum requests allowed within a single rate-limit window */
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '20', 10),

  /** Maximum number of concurrent outgoing audit HTTP requests */
  maxConcurrentAudits: parseInt(process.env.MAX_CONCURRENT_AUDITS ?? '10', 10),

  /** Per-audit HTTP fetch timeout in milliseconds */
  auditTimeoutMs: parseInt(process.env.AUDIT_TIMEOUT_MS ?? '8000', 10),

  /** Log level (trace | debug | info | warn | error | fatal) */
  logLevel: process.env.LOG_LEVEL ?? 'info',

  /** Node environment hint */
  nodeEnv: process.env.NODE_ENV ?? 'development',
} as const;

export type AppConfig = typeof config;
