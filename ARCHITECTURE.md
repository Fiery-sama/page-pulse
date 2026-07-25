# 🏗 Page Pulse — Architecture Document (Task B: Design for Scale)

> **Target:** 10,000 audits/day with burst capacity of 500 concurrent users.

---

## 1. System Architecture

```
                    ┌──────────────────────┐
                    │   Load Balancer       │
                    │   (Nginx / ALB)       │
                    │   TLS + Edge Rate     │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     ┌────────▼───────┐ ┌─────▼──────┐ ┌───────▼──────┐
     │  API Server 1  │ │ API Server 2│ │ API Server N │
     │  (Stateless)   │ │ (Stateless) │ │ (Stateless)  │
     └────────┬───────┘ └─────┬──────┘ └───────┬──────┘
              │               │                │
              └───────────────┼────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   Redis Cluster    │
                    │ ┌───────────────┐  │
                    │ │ Cache (TTL)   │  │
                    │ │ Rate Limiters │  │
                    │ │ BullMQ Queue  │  │
                    │ └───────────────┘  │
                    └─────────┬─────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
     ┌────────▼───────┐ ┌────▼──────┐ ┌──────▼──────┐
     │   Worker 1     │ │ Worker 2  │ │  Worker M   │
     │ (10 concurrent)│ │(10 conc.) │ │ (10 conc.)  │
     └────────┬───────┘ └────┬──────┘ └──────┬──────┘
              │              │               │
              └──────────────┼───────────────┘
                             │
                   ┌─────────▼─────────┐
                   │   PostgreSQL 16   │
                   │  (Audit History)  │
                   └───────────────────┘
```

### Component Responsibilities

| Component          | Role                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------ |
| **Load Balancer**  | TLS termination, edge rate limiting, health-check routing, sticky sessions (optional) |
| **API Server**     | Validate → cache check → enqueue; fully stateless, horizontally scalable             |
| **Redis Cluster**  | Shared cache (TTL), BullMQ queue backend, distributed rate-limit counters             |
| **Worker Pool**    | Dequeue jobs, fetch URLs, run audit engine, write results to cache + DB               |
| **PostgreSQL**     | Immutable audit history, user accounts, API keys, analytics queries                   |

---

## 2. Request Lifecycle & Data Flow

```
Client → POST /api/v1/audit { url }
│
├─ 1. Validate URL format (Zod schema)
├─ 2. SSRF check (DNS resolve → block private/loopback/metadata IPs)
├─ 3. Redis cache lookup (key = sha256(normalized_url))
│     ├─ HIT  → return 200 { cached: true, data: AuditReport }
│     └─ MISS → continue
├─ 4. Redis rate-limit check (INCR sliding window, key = client_ip)
│     └─ EXCEEDED → 429 { code: RATE_LIMIT_EXCEEDED, Retry-After }
├─ 5. Enqueue BullMQ job { url, requestId, priority, timestamp }
│     └─ Return 202 { jobId, pollUrl: /api/v1/jobs/:id }
│
Worker picks up job:
├─ 6. HTTP fetch with AbortController timeout (8s default)
├─ 7. Parse HTML (Cheerio) → run 4-pillar audit engine
├─ 8. Compute pillar scores (0-100) + overall grade (A+ … F)
├─ 9. Write to Redis cache (SET + EXPIRE ttl) + PostgreSQL (INSERT)
└─10. Mark job complete → Client polls → 200 { data: AuditReport }
```

---

## 3. Queueing Strategy (BullMQ + Redis)

### Why BullMQ?

- **Native Node.js** — no protocol translation (vs. RabbitMQ AMQP)
- **Redis-backed** — reuses existing Redis infra (no new service to operate)
- **Priority lanes** — separate queues for free/premium tiers
- **Exactly-once** — at-least-once delivery with idempotent job IDs
- **DLQ support** — dead-letter queue for jobs exceeding max retries
- **Dashboard** — Bull Board UI for operational monitoring

### Job State Machine

```
waiting → active → completed
              ↓
           failed → (retry 1-3x) → dead (DLQ)
```

### Capacity Planning

| Metric                        | Value                                |
| ----------------------------- | ------------------------------------ |
| Target throughput             | 10,000 audits/day                    |
| Average throughput            | 0.12 audits/sec                      |
| Peak burst                    | 500 concurrent requests              |
| Average audit duration        | 2 seconds (fetch + parse + score)    |
| Worker concurrency            | 10 audits/worker                     |
| Single worker throughput      | ~5 audits/sec                        |
| Required workers (sustained)  | 1 (with 40x headroom)               |
| Required workers (burst)      | 10 (500 / 50 slots)                 |
| Queue max depth before shed   | 1,000 jobs                           |
| Auto-scale trigger            | Queue depth > 100 for 30 seconds     |

---

## 4. Technology Decision Record (ADR)

| Decision           | Selected           | Rejected                 | Rationale                                                                 |
| ------------------ | ------------------ | ------------------------ | ------------------------------------------------------------------------- |
| **Runtime**        | Node.js 22 (TS)    | Python 3.12, Go 1.22     | Shared TS with frontend; event loop ideal for I/O-bound audit fetches     |
| **HTTP Framework** | Express 4          | Fastify, Hono            | Largest middleware ecosystem; audit fetch latency dwarfs framework overhead |
| **Validation**     | Zod                | Joi, class-validator     | Native TS type inference; tree-shakeable; no decorator magic               |
| **HTML Parser**    | Cheerio            | Puppeteer, JSDOM         | 10x faster, 50x less RAM than headless browser for DOM traversal           |
| **Queue**          | BullMQ + Redis     | RabbitMQ, AWS SQS        | Native Node.js; reuses Redis; priorities, DLQ, Bull Board UI               |
| **Cache**          | Redis (TTL keys)   | Memcached, in-memory     | Shared across API instances; persistence; atomic operations                |
| **Database**       | PostgreSQL 16      | MongoDB, DynamoDB        | Relational audit history; JSONB for findings; date partitioning            |
| **Test Runner**    | Vitest             | Jest, Mocha              | Vite-native; ESM first; 3-5x faster on TS projects                        |
| **CI**             | GitHub Actions     | CircleCI, Jenkins        | Native GitHub integration; generous free tier; matrix builds               |

---

## 5. Failure Mode Analysis

### F1: Redis Cluster Failure

| Aspect       | Detail                                                                          |
| ------------ | ------------------------------------------------------------------------------- |
| **Trigger**  | Redis primary node crash, network partition, OOM kill                            |
| **Impact**   | Cache misses (all audits hit origin); queue stalls (no new jobs processed)        |
| **Detection** | Redis Sentinel heartbeat; Prometheus `redis_up` metric drops to 0               |
| **Mitigation** | Automatic Sentinel failover to replica (< 5s); API falls back to in-memory cache |
| **Recovery** | Redis auto-reconnects; BullMQ replays pending jobs from AOF persistence          |
| **RTO**      | < 30 seconds (Sentinel failover + reconnect)                                    |

### F2: Worker Pool Exhaustion Under 500-Burst

| Aspect       | Detail                                                                          |
| ------------ | ------------------------------------------------------------------------------- |
| **Trigger**  | 500 simultaneous audit requests exceed worker processing capacity                |
| **Impact**   | Queue depth spikes → client-perceived latency increases → potential timeouts      |
| **Detection** | `bullmq_queue_depth > 200` for 30s (Prometheus alert → PagerDuty)               |
| **Mitigation** | K8s HPA auto-scales workers on queue depth; shed load with 503 when queue > 1000 |
| **Recovery** | Workers drain backlog; HPA scales down after depth < 50 for 5 minutes            |
| **RTO**      | < 2 minutes (auto-scale warm-up)                                                 |

### F3: Target Site Cascade (Slow/Unresponsive Origins)

| Aspect       | Detail                                                                          |
| ------------ | ------------------------------------------------------------------------------- |
| **Trigger**  | Popular audit target (e.g., news site) becomes slow → workers block on fetch     |
| **Impact**   | Concurrency slots exhausted → healthy audits stuck behind slow ones               |
| **Detection** | Per-domain timeout rate > 50% within 5 minutes (circuit breaker metric)          |
| **Mitigation** | 8s AbortController timeout; per-domain circuit breaker (opens after 5 failures)  |
| **Recovery** | Circuit half-opens after 60s; single probe request tests recovery before closing  |
| **RTO**      | Immediate (timeout) + 60s (circuit breaker cooldown)                             |

---

## 6. Observability

### RED Metrics (Request-Oriented)

| Metric           | Instrument                                    | Alert Threshold        |
| ---------------- | --------------------------------------------- | ---------------------- |
| **Rate**         | `audit_requests_total` (counter, by status)    | < 0.01/s for 5m = dead |
| **Errors**       | `audit_errors_total` (counter, by code)        | > 5% error rate        |
| **Duration**     | `audit_duration_seconds` (histogram)           | p99 > 10s              |

### USE Metrics (Resource-Oriented)

| Resource         | Utilization             | Saturation          | Errors            |
| ---------------- | ----------------------- | ------------------- | ----------------- |
| **CPU**          | `node_cpu_percent`       | Event loop lag > 50ms | OOM kills         |
| **Memory**       | `process_heap_bytes`     | RSS > 80% limit     | Heap exhaustion   |
| **Redis**        | `redis_connected_clients` | Connection pool full | Connection resets |
| **Queue**        | `bullmq_active_count`    | Depth > 200         | Failed jobs/min   |

### Monitoring Stack

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│ Pino (JSON) │───▶│ Loki / ELK   │───▶│  Grafana     │
│ Logs        │    │ Log Storage  │    │  Dashboards  │
└─────────────┘    └──────────────┘    └──────────────┘

┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│ prom-client │───▶│ Prometheus   │───▶│  Alertmanager│
│ Metrics     │    │ TSDB         │    │  → PagerDuty │
└─────────────┘    └──────────────┘    └──────────────┘

┌─────────────┐    ┌──────────────┐
│ OpenTelemetry│──▶│ Jaeger/Tempo │  (Distributed Tracing)
│ SDK         │    │              │
└─────────────┘    └──────────────┘
```

---

## 7. Rollback Strategy

| Strategy        | Scope                | Mechanism                                   | Rollback Time |
| --------------- | -------------------- | ------------------------------------------- | ------------- |
| **Canary**      | New API/Worker code  | 5% traffic → promote after 15min green SLOs | < 1 minute    |
| **Blue-Green**  | Full deployment      | LB target group swap (instant)              | < 10 seconds  |
| **Feature Flags** | New audit rules    | LaunchDarkly toggle (no redeploy)           | Instant       |
| **Database**    | Schema migrations    | Forward-compatible only; no destructive DDL | N/A (safe)    |

### Deployment Pipeline

```
git push → CI (lint + typecheck + test)
         → Build container image
         → Push to ECR
         → Deploy canary (5% traffic, 15min bake)
         → SLO check (error rate < 1%, p99 < 5s)
              ├─ PASS → promote to 100%
              └─ FAIL → auto-rollback to previous version
```

---

> Built for [Digital Heroes Training Task](https://digitalheroesco.com)
