// ─── Scale Architecture Component (Task B) ─────────────────────────────────
// Interactive technical design blueprint for scaling to 10,000 audits/day.
// Covers architecture, queueing, ADR, failure modes, and observability.

import {
  Server,
  Layers,
  Database,
  AlertTriangle,
  Activity,
  GitBranch,
  Shield,
  Cpu,
  HardDrive,
  Gauge,
} from 'lucide-react';

export default function ScaleArchitecture() {
  return (
    <div>
      {/* ── System Architecture ────────────────────────────────────────── */}
      <section className="arch-section" style={{ animationDelay: '0.1s' }}>
        <h2><Server size={22} /> System Architecture Overview</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 16 }}>
          Scaling Page Pulse to handle <strong>10,000 audits/day</strong> with burst capacity of
          500 concurrent users. The architecture separates <em>HTTP ingress</em> from
          <em> audit execution</em> via a persistent message queue, enabling independent
          horizontal scaling of API servers and workers.
        </p>

        <div className="arch-grid">
          <div className="glass-card arch-card">
            <h4>🌐 API Gateway / Load Balancer</h4>
            <ul>
              <li>Nginx or AWS ALB distributes traffic</li>
              <li>TLS termination & rate limiting at edge</li>
              <li>Health-check routing to N API instances</li>
            </ul>
          </div>
          <div className="glass-card arch-card emerald">
            <h4>⚡ API Server (Stateless, N replicas)</h4>
            <ul>
              <li>Accepts POST /api/v1/audit</li>
              <li>Validates URL + SSRF check</li>
              <li>Checks Redis cache → return if hit</li>
              <li>Enqueues job to BullMQ if cache miss</li>
              <li>Returns job ID + polling URL</li>
            </ul>
          </div>
          <div className="glass-card arch-card indigo">
            <h4>📮 BullMQ Job Queue (Redis-backed)</h4>
            <ul>
              <li>Persistent, ordered, deduplicated jobs</li>
              <li>Configurable per-job timeout & retries</li>
              <li>Priority lanes (free vs. premium)</li>
              <li>Dead letter queue for poison pills</li>
            </ul>
          </div>
          <div className="glass-card arch-card purple">
            <h4>🔧 Worker Pool (M replicas)</h4>
            <ul>
              <li>Dequeues jobs and fetches target URLs</li>
              <li>Runs 4-pillar audit engine (Cheerio)</li>
              <li>Writes results to Redis cache + Postgres</li>
              <li>Concurrency: 10 audits/worker process</li>
            </ul>
          </div>
          <div className="glass-card arch-card amber">
            <h4>🗄 Redis (Cache + Queue Backend)</h4>
            <ul>
              <li>Shared TTL cache (60s default, configurable)</li>
              <li>BullMQ queue persistence</li>
              <li>Distributed rate-limit counters</li>
              <li>Deployed as Redis Cluster for HA</li>
            </ul>
          </div>
          <div className="glass-card arch-card rose">
            <h4>🐘 PostgreSQL (Persistent Store)</h4>
            <ul>
              <li>Historical audit results (immutable log)</li>
              <li>User accounts & API key management</li>
              <li>Aggregated analytics & trend queries</li>
              <li>Partitioned by audit date for performance</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── Data Flow ──────────────────────────────────────────────────── */}
      <section className="arch-section" style={{ animationDelay: '0.2s' }}>
        <h2><Layers size={22} /> Request Lifecycle & Data Flow</h2>
        <div className="glass-card">
          <div className="code-block">
            <code>
{`Client POST /api/v1/audit { url }
  │
  ├─ 1. API Server: Validate URL (Zod) + SSRF check (DNS resolve → IP block)
  ├─ 2. Check Redis cache (key = normalized URL)
  │     ├─ HIT  → return cached AuditReport (< 1ms)
  │     └─ MISS → continue
  ├─ 3. Check rate limit (Redis INCR sliding window)
  │     └─ OVER → 429 + Retry-After header
  ├─ 4. Enqueue BullMQ job { url, requestId, priority }
  │     └─ Return 202 Accepted { jobId, pollUrl: /api/v1/jobs/:id }
  │
  ▼ Worker picks up job
  ├─ 5. Fetch target URL (httpx/fetch + AbortController timeout)
  ├─ 6. Parse HTML (Cheerio) → run 4-pillar audit
  ├─ 7. Compute scores + grade
  ├─ 8. Write to Redis cache (TTL) + PostgreSQL (permanent)
  └─ 9. Mark job complete → Client polls /api/v1/jobs/:id → 200 + AuditReport`}
            </code>
          </div>
        </div>
      </section>

      {/* ── Queueing Strategy ──────────────────────────────────────────── */}
      <section className="arch-section" style={{ animationDelay: '0.3s' }}>
        <h2><Database size={22} /> Queueing Strategy & State Management</h2>
        <div className="arch-grid">
          <div className="glass-card arch-card">
            <h4>Why BullMQ + Redis?</h4>
            <p>
              BullMQ provides durable, Redis-backed job queues with exactly-once processing semantics,
              configurable retries with exponential backoff, priority lanes, job deduplication, and
              built-in dead-letter queue support — all critical for reliable audit processing at scale.
            </p>
          </div>
          <div className="glass-card arch-card emerald">
            <h4>Job State Machine</h4>
            <ul>
              <li><strong>waiting</strong> → queued, awaiting worker</li>
              <li><strong>active</strong> → worker processing</li>
              <li><strong>completed</strong> → audit result available</li>
              <li><strong>failed</strong> → retryable error (up to 3x)</li>
              <li><strong>dead</strong> → moved to DLQ after max retries</li>
            </ul>
          </div>
          <div className="glass-card arch-card indigo">
            <h4>Capacity Math (10K audits/day)</h4>
            <ul>
              <li>10,000 / 86,400 ≈ 0.12 audits/second (avg)</li>
              <li>Burst: 500 concurrent → queue absorbs spike</li>
              <li>Worker: 10 concurrent × 2s avg = 5 audits/s/worker</li>
              <li>2 workers handle 10 audits/s → 28x headroom</li>
              <li>Auto-scale workers at queue depth &gt; 100</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── Technology Decision Record ─────────────────────────────────── */}
      <section className="arch-section" style={{ animationDelay: '0.4s' }}>
        <h2><GitBranch size={22} /> Technology Decision Record (ADR)</h2>
        <div className="glass-card" style={{ overflowX: 'auto' }}>
          <table className="adr-table">
            <thead>
              <tr>
                <th>Decision</th>
                <th>Selected</th>
                <th>Alternatives Considered</th>
                <th>Rationale</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Runtime</strong></td>
                <td><span className="tech-badge">Node.js 22</span></td>
                <td><span className="tech-badge rejected">Python 3.12</span></td>
                <td>Shared language (TS) with frontend; native event loop excels at I/O-bound audit fetches; lower memory per connection for high concurrency.</td>
              </tr>
              <tr>
                <td><strong>HTTP Framework</strong></td>
                <td><span className="tech-badge">Express 4</span></td>
                <td><span className="tech-badge rejected">Fastify</span></td>
                <td>Express has the largest middleware ecosystem, simplest debugging, and widest team familiarity. Fastify's raw throughput advantage is negligible when audit fetch latency dominates.</td>
              </tr>
              <tr>
                <td><strong>Validation</strong></td>
                <td><span className="tech-badge">Zod</span></td>
                <td><span className="tech-badge rejected">Joi</span> <span className="tech-badge rejected">class-validator</span></td>
                <td>Zod infers TypeScript types from schemas (no duplication), is tree-shakeable, and has a smaller bundle. Joi lacks native TS inference.</td>
              </tr>
              <tr>
                <td><strong>HTML Parser</strong></td>
                <td><span className="tech-badge">Cheerio</span></td>
                <td><span className="tech-badge rejected">Puppeteer</span> <span className="tech-badge rejected">JSDOM</span></td>
                <td>Cheerio is 10x faster and uses 50x less RAM than Puppeteer (no browser process). JSDOM is slower and heavier than Cheerio for read-only DOM traversal.</td>
              </tr>
              <tr>
                <td><strong>Queue</strong></td>
                <td><span className="tech-badge">BullMQ</span></td>
                <td><span className="tech-badge rejected">RabbitMQ</span> <span className="tech-badge rejected">SQS</span></td>
                <td>BullMQ is native Node.js, reuses the existing Redis instance (no new infra), supports priorities and DLQ, and has excellent Dashboard UI (Bull Board).</td>
              </tr>
              <tr>
                <td><strong>Test Framework</strong></td>
                <td><span className="tech-badge">Vitest</span></td>
                <td><span className="tech-badge rejected">Jest</span> <span className="tech-badge rejected">Mocha</span></td>
                <td>Vitest is Vite-native (shared config with frontend), supports ESM natively, runs 3-5x faster than Jest on TypeScript projects, and has built-in coverage via V8.</td>
              </tr>
              <tr>
                <td><strong>Database</strong></td>
                <td><span className="tech-badge">PostgreSQL 16</span></td>
                <td><span className="tech-badge rejected">MongoDB</span> <span className="tech-badge rejected">DynamoDB</span></td>
                <td>Relational model fits audit history (normalized URL, scores, findings). JSONB columns for flexible finding details. Table partitioning by date for efficient range queries.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Failure Modes ──────────────────────────────────────────────── */}
      <section className="arch-section" style={{ animationDelay: '0.5s' }}>
        <h2><AlertTriangle size={22} /> Failure Mode Analysis</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 16 }}>
          Three critical failure scenarios at 500 concurrent burst with mitigations:
        </p>

        <div className="arch-grid">
          <div className="glass-card arch-card rose">
            <h4><Shield size={16} style={{ display: 'inline', marginRight: 6 }} />
              F1: Redis Cluster Failure
            </h4>
            <p><strong>Impact:</strong> Cache misses → all audits hit origin; queue stalls → no new jobs processed.</p>
            <ul style={{ marginTop: 8 }}>
              <li><strong>Detect:</strong> Redis Sentinel heartbeat + Prometheus redis_up alert</li>
              <li><strong>Mitigate:</strong> Automatic failover to replica (Sentinel); API falls back to in-memory cache (degraded mode)</li>
              <li><strong>Recover:</strong> Redis auto-reconnect; BullMQ replays pending jobs from AOF persistence</li>
            </ul>
          </div>
          <div className="glass-card arch-card amber">
            <h4><Cpu size={16} style={{ display: 'inline', marginRight: 6 }} />
              F2: Worker Pool Exhaustion (500 burst)
            </h4>
            <p><strong>Impact:</strong> Queue depth spikes → latency increases → client timeouts.</p>
            <ul style={{ marginTop: 8 }}>
              <li><strong>Detect:</strong> Queue depth metric &gt; 200 for 30s (Prometheus alert)</li>
              <li><strong>Mitigate:</strong> Auto-scale workers (K8s HPA on queue depth); shed load with 503 + Retry-After when queue &gt; 1000</li>
              <li><strong>Recover:</strong> Workers drain backlog; auto-scale down after queue normalizes</li>
            </ul>
          </div>
          <div className="glass-card arch-card indigo">
            <h4><HardDrive size={16} style={{ display: 'inline', marginRight: 6 }} />
              F3: Target Site Unresponsive (Cascade)
            </h4>
            <p><strong>Impact:</strong> Workers block on slow fetches → concurrency slots exhausted → healthy audits queued behind.</p>
            <ul style={{ marginTop: 8 }}>
              <li><strong>Detect:</strong> Per-domain timeout rate &gt; 50% (circuit breaker)</li>
              <li><strong>Mitigate:</strong> 8s hard timeout (AbortController); per-domain circuit breaker (open after 5 consecutive failures)</li>
              <li><strong>Recover:</strong> Circuit half-opens after 60s; probe request tests recovery</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── Observability & Rollback ───────────────────────────────────── */}
      <section className="arch-section" style={{ animationDelay: '0.6s' }}>
        <h2><Activity size={22} /> Observability & Rollback Plan</h2>

        <div className="arch-grid">
          <div className="glass-card arch-card">
            <h4><Gauge size={16} style={{ display: 'inline', marginRight: 6 }} />
              RED Metrics (Request-oriented)
            </h4>
            <ul>
              <li><strong>Rate:</strong> audit requests/sec (by endpoint, status)</li>
              <li><strong>Errors:</strong> 4xx/5xx rate, SSRF block rate</li>
              <li><strong>Duration:</strong> p50/p95/p99 audit latency</li>
            </ul>
          </div>
          <div className="glass-card arch-card emerald">
            <h4><Gauge size={16} style={{ display: 'inline', marginRight: 6 }} />
              USE Metrics (Resource-oriented)
            </h4>
            <ul>
              <li><strong>Utilization:</strong> CPU%, Memory%, Redis connections</li>
              <li><strong>Saturation:</strong> Queue depth, event loop lag</li>
              <li><strong>Errors:</strong> OOM kills, connection resets</li>
            </ul>
          </div>
          <div className="glass-card arch-card purple">
            <h4>📊 Monitoring Stack</h4>
            <ul>
              <li>Prometheus + Grafana dashboards</li>
              <li>Pino JSON logs → Loki / ELK</li>
              <li>PagerDuty alerts on SLO breach</li>
              <li>Distributed tracing (OpenTelemetry)</li>
            </ul>
          </div>
          <div className="glass-card arch-card amber">
            <h4>🔄 Rollback Strategy</h4>
            <ul>
              <li><strong>Canary:</strong> 5% traffic to new version; promote after 15min green SLOs</li>
              <li><strong>Blue-Green:</strong> Full switchover with instant rollback via LB target group swap</li>
              <li><strong>Feature Flags:</strong> LaunchDarkly gates for new audit rules</li>
              <li><strong>Database:</strong> Forward-compatible migrations only; no destructive DDL</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
