// ─── Audit Results Component ────────────────────────────────────────────────
// Displays the overall grade, four score gauge dials, detailed findings
// with tabbed navigation, meta information, and raw JSON viewer.

import { useState } from 'react';
import {
  CheckCircle,
  XCircle,
  Clock,
  Database,
  FileCode,
  BarChart3,
} from 'lucide-react';
import type { AuditResponse, PillarScore } from '../App';

interface Props {
  result: AuditResponse | null;
  requestId: string;
}

type PillarKey = 'seo' | 'performance' | 'security' | 'accessibility';

const PILLAR_LABELS: Record<PillarKey, string> = {
  seo: 'SEO',
  performance: 'Performance',
  security: 'Security',
  accessibility: 'Accessibility',
};

function getGradeClass(grade: string): string {
  const letter = grade.charAt(0);
  if (letter === 'A') return 'grade-a';
  if (letter === 'B') return 'grade-b';
  if (letter === 'C') return 'grade-c';
  if (letter === 'D') return 'grade-d';
  return 'grade-f';
}

function ScoreGauge({ score, label, pillar }: { score: number; label: string; pillar: PillarKey }) {
  const circumference = 2 * Math.PI * 45; // r=45
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="score-gauge-card glass-card">
      <div className="gauge-chart-wrapper">
        <svg className="gauge-svg" viewBox="0 0 100 100">
          <circle className="gauge-bg" cx="50" cy="50" r="45" />
          <circle
            className={`gauge-fill ${pillar}`}
            cx="50"
            cy="50"
            r="45"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="gauge-score-text">{score}</div>
      </div>
      <div className="gauge-label">{label}</div>
    </div>
  );
}

function FindingsList({ pillarData }: { pillarData: PillarScore }) {
  return (
    <div>
      {pillarData.findings.map((f, i) => (
        <div key={i} className="finding-item" style={{ animationDelay: `${i * 0.05}s` }}>
          <div className={`finding-icon ${f.pass ? 'pass' : 'fail'}`}>
            {f.pass ? <CheckCircle size={14} /> : <XCircle size={14} />}
          </div>
          <div>
            <div className="finding-rule">{f.rule}</div>
            <div className="finding-message">
              {f.message}
              <span className={`finding-impact impact-${f.impact}`}>{f.impact}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AuditResults({ result, requestId }: Props) {
  const [activePillar, setActivePillar] = useState<PillarKey>('seo');
  const [showJson, setShowJson] = useState(false);

  if (!result) {
    return (
      <div className="glass-card" style={{ textAlign: 'center', padding: '64px 24px' }}>
        <BarChart3 size={48} style={{ color: 'var(--text-muted)', marginBottom: 16 }} />
        <h2 style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>No Results Yet</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: 8, fontSize: '0.9rem' }}>
          Run an audit from the Live Audit tab to see results here.
        </p>
      </div>
    );
  }

  const { data, cached, cachedAt, expiresInSeconds } = result;
  const pillars: PillarKey[] = ['seo', 'performance', 'security', 'accessibility'];

  return (
    <div>
      {/* Overall Grade */}
      <div className="overall-grade glass-card glass-card-accent">
        <div className={`grade-badge ${getGradeClass(data.grade)}`}>
          {data.grade}
        </div>
        <div className="grade-info">
          <h2>
            Overall Score: <span className="grade-score">{data.overallScore}/100</span>
          </h2>
          <p>
            Audited <strong>{data.url}</strong> — HTTP {data.meta.httpStatus}
          </p>
        </div>
      </div>

      {/* Score Gauges */}
      <div className="score-gauges">
        {pillars.map((p) => (
          <ScoreGauge
            key={p}
            score={data[p].score}
            label={PILLAR_LABELS[p]}
            pillar={p}
          />
        ))}
      </div>

      {/* Findings Tabs */}
      <div className="glass-card" style={{ marginTop: 24, animation: 'slide-up 0.5s ease-out 0.5s both' }}>
        <div className="findings-tabs">
          {pillars.map((p) => (
            <button
              key={p}
              className={`findings-tab ${activePillar === p ? 'active' : ''}`}
              onClick={() => setActivePillar(p)}
            >
              {PILLAR_LABELS[p]} ({data[p].score})
            </button>
          ))}
        </div>
        <FindingsList pillarData={data[activePillar]} />
      </div>

      {/* Meta Bar */}
      <div className="meta-bar" style={{ animation: 'slide-up 0.5s ease-out 0.6s both' }}>
        <div className="meta-item">
          <span className="meta-label">Request ID</span>
          <span className="meta-value">{requestId || '—'}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">
            <Clock size={12} style={{ display: 'inline', marginRight: 4 }} />
            TTFB
          </span>
          <span className="meta-value">{data.meta.ttfbMs}ms</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Total Time</span>
          <span className="meta-value">{data.meta.totalTimeMs}ms</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Size</span>
          <span className="meta-value">{Math.round(data.meta.contentLengthBytes / 1024)} KB</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">
            <Database size={12} style={{ display: 'inline', marginRight: 4 }} />
            Cached
          </span>
          <span className={`meta-value ${cached ? 'cached-yes' : ''}`}>
            {cached ? `Yes (expires in ${expiresInSeconds}s)` : 'No (fresh)'}
          </span>
        </div>
        {cached && cachedAt && (
          <div className="meta-item">
            <span className="meta-label">Cached At</span>
            <span className="meta-value">{new Date(cachedAt).toLocaleTimeString()}</span>
          </div>
        )}
      </div>

      {/* Raw JSON Toggle */}
      <div style={{ marginTop: 20, textAlign: 'center' }}>
        <button
          className="btn btn-ghost"
          onClick={() => setShowJson(!showJson)}
        >
          <FileCode size={16} />
          {showJson ? 'Hide' : 'Show'} Raw JSON Response
        </button>
      </div>

      {showJson && (
        <div className="json-viewer" style={{ animation: 'fade-in 0.3s ease-out' }}>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
