# 🔬 Page Pulse — Production-Grade URL Audit Service

> **Built for [Digital Heroes Training Task](https://digitalheroesco.com)**

A high-performance, production-grade URL audit service that analyzes web pages across **SEO**, **Performance**, **Security**, and **Accessibility** pillars — featuring structured error handling, SSRF protection, configurable caching, rate limiting, concurrency control, and a comprehensive test suite.

---

## ✨ Features

| Feature                      | Description                                                                 |
| ---------------------------- | --------------------------------------------------------------------------- |
| 🔍 **4-Pillar Audit Engine** | SEO, Performance, Security Headers, Accessibility scoring with findings     |
| 🛡 **SSRF Protection**       | DNS-resolution IP blocking for loopback, private, link-local, metadata IPs  |
| ⚡ **Configurable Cache**     | TTL-based in-memory cache with `cached`, `cachedAt`, `expiresInSeconds`     |
| 🚦 **Rate Limiting**         | Sliding-window per-IP/API-key with `X-RateLimit-*` headers                 |
| 🔒 **Concurrency Control**   | Async semaphore (`p-limit`) bounding outgoing HTTP fetches                  |
| ⏱ **Request Timeouts**       | `AbortController`-based configurable timeout per audit                      |
| 📋 **Structured Logging**    | Pino JSON logs with UUID `X-Request-ID` propagation                         |
| 📊 **Structured Errors**     | Consistent `{ success, error: { code, message, details, timestamp } }` JSON |
| 🧪 **Test Suite**            | Vitest + Supertest integration tests (SSRF, cache, rate limit, timeout)     |
| 🔄 **CI Pipeline**           | GitHub Actions with Node 20/22 matrix, typecheck, test, coverage            |
| 🎨 **Rich Web UI**           | React + Vite dark glassmorphism dashboard with animated score gauges        |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 20.0.0
- **npm** ≥ 9.0.0

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd page-pulse

# Install backend dependencies
cd server
npm install

# Install frontend dependencies
cd ../client
npm install
```

### Development

Start both servers simultaneously:

```bash
# Terminal 1 — Backend API (http://localhost:3001)
cd server
npm run dev

# Terminal 2 — Frontend UI (http://localhost:5173)
cd client
npm run dev
```

The frontend proxies `/api` requests to the backend via Vite's dev proxy.

### Run Tests

```bash
cd server
npm test
```

---

## 📡 API Contract

### `POST /api/v1/audit`

Submit a URL for comprehensive audit.

**Request Body:**
```json
{
  "url": "https://example.com",
  "bypassCache": false
}
```

**Success Response (200):**
```json
{
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
}
```

### `GET /api/v1/audit?url=https://example.com`

Same as POST, accepts URL via query parameter.

### `GET /api/v1/health`

Returns `{ success: true, status: "healthy", uptime: ... }`.

### `GET /api/v1/stats`

Returns concurrency info: `{ concurrency: { active, pending } }`.

---

## 🔐 Error Codes

| HTTP | Code                  | Description                                        |
| ---- | --------------------- | -------------------------------------------------- |
| 400  | `VALIDATION_ERROR`    | Invalid or missing URL, malformed request           |
| 403  | `SSRF_BLOCKED`        | URL resolves to a restricted private/loopback IP    |
| 429  | `RATE_LIMIT_EXCEEDED` | Client exceeded the request quota for the window    |
| 502  | `FETCH_FAILED`        | Target URL unreachable or returned an error         |
| 504  | `AUDIT_TIMEOUT`       | Target did not respond within the configured timeout |
| 500  | `INTERNAL_ERROR`      | Unexpected server error                             |

---

## ⚙️ Configuration

All parameters are configurable via environment variables:

| Variable                 | Default | Description                        |
| ------------------------ | ------- | ---------------------------------- |
| `PORT`                   | `3001`  | Server listening port              |
| `CACHE_TTL_SECONDS`      | `60`    | Cache entry time-to-live           |
| `RATE_LIMIT_WINDOW_MS`   | `60000` | Rate limit window (ms)             |
| `RATE_LIMIT_MAX_REQUESTS` | `20`   | Max requests per window per client |
| `MAX_CONCURRENT_AUDITS`  | `10`    | Max concurrent outgoing fetches    |
| `AUDIT_TIMEOUT_MS`       | `8000`  | Per-audit HTTP timeout (ms)        |
| `LOG_LEVEL`              | `info`  | Pino log level                     |

---

## 🏗 Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full-scale design document (Task B) covering:

- System architecture diagram & data flow
- BullMQ queueing strategy & state management
- Technology Decision Record (ADR)
- Failure mode analysis (3 critical scenarios at 500 burst)
- Observability (RED/USE metrics) & rollback plan

---

## 📁 Project Structure

```
page-pulse/
├── .github/workflows/ci.yml     # GitHub Actions CI
├── README.md                     # This file
├── ARCHITECTURE.md               # Task B: Design for scale
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── src/
│   │   ├── index.ts              # Server bootstrap + graceful shutdown
│   │   ├── config.ts             # Environment-based configuration
│   │   ├── utils/
│   │   │   ├── logger.ts         # Pino structured logger
│   │   │   └── errors.ts         # AppError classes + structured envelope
│   │   ├── middleware/
│   │   │   ├── requestId.ts      # UUID X-Request-ID injection
│   │   │   ├── rateLimiter.ts    # Sliding-window rate limiter
│   │   │   └── errorHandler.ts   # Global error handler
│   │   ├── services/
│   │   │   ├── validator.ts      # URL validation + SSRF protection
│   │   │   ├── cacheService.ts   # TTL-based in-memory cache
│   │   │   ├── concurrencyLimiter.ts  # p-limit async semaphore
│   │   │   └── auditService.ts   # Core 4-pillar audit engine
│   │   └── routes/
│   │       └── auditRouter.ts    # API route definitions
│   └── tests/
│       └── audit.test.ts         # Integration test suite
└── client/
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx                # Main shell + types
        ├── index.css              # Design system
        └── components/
            ├── AuditDashboard.tsx  # URL input + live audit
            ├── AuditResults.tsx    # Score gauges + findings
            ├── ScaleArchitecture.tsx  # Task B explorer
            ├── ApiDocs.tsx        # API documentation
            └── Footer.tsx         # Credit line
```

---

## 📄 License

MIT

---

> Built for [Digital Heroes Training Task](https://digitalheroesco.com)
