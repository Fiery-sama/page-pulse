// ─── Structured Error Handling ──────────────────────────────────────────────
// Custom application error class and a factory for building the standardised
// JSON error envelope: { success, error: { code, message, details, … } }

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    // Maintain proper stack trace (V8 engines)
    Error.captureStackTrace?.(this, AppError);
  }
}

// ── Convenience subclasses ──────────────────────────────────────────────────

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, 'VALIDATION_ERROR', message, details);
    this.name = 'ValidationError';
  }
}

export class SSRFError extends AppError {
  constructor(message = 'The requested URL targets a restricted network address') {
    super(403, 'SSRF_BLOCKED', message);
    this.name = 'SSRFError';
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfterSeconds: number) {
    super(429, 'RATE_LIMIT_EXCEEDED', 'Too many requests – please try again later', {
      retryAfterSeconds,
    });
    this.name = 'RateLimitError';
  }
}

export class AuditTimeoutError extends AppError {
  constructor(url: string, timeoutMs: number) {
    super(504, 'AUDIT_TIMEOUT', `The target URL did not respond within ${timeoutMs}ms`, {
      url,
      timeoutMs,
    });
    this.name = 'AuditTimeoutError';
  }
}

export class FetchError extends AppError {
  constructor(url: string, reason: string) {
    super(502, 'FETCH_FAILED', `Failed to fetch the target URL: ${reason}`, { url });
    this.name = 'FetchError';
  }
}

// ── Structured error envelope builder ───────────────────────────────────────

export interface StructuredError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    timestamp: string;
    requestId?: string;
  };
}

export function buildErrorResponse(
  code: string,
  message: string,
  requestId?: string,
  details?: unknown,
): StructuredError {
  return {
    success: false,
    error: {
      code,
      message,
      details,
      timestamp: new Date().toISOString(),
      requestId,
    },
  };
}
