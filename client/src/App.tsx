// ─── Page Pulse – Main App Shell ────────────────────────────────────────────

import { useState } from 'react';
import {
  Activity,
  Search,
  BarChart3,
  Server,
  BookOpen,
} from 'lucide-react';
import AuditDashboard from './components/AuditDashboard';
import AuditResults from './components/AuditResults';
import ScaleArchitecture from './components/ScaleArchitecture';
import ApiDocs from './components/ApiDocs';
import Footer from './components/Footer';

// Shared types
export interface Finding {
  rule: string;
  pass: boolean;
  message: string;
  impact: 'critical' | 'major' | 'minor' | 'info';
}

export interface PillarScore {
  score: number;
  findings: Finding[];
}

export interface AuditMeta {
  fetchedAt: string;
  ttfbMs: number;
  totalTimeMs: number;
  contentLengthBytes: number;
  httpStatus: number;
}

export interface AuditReport {
  url: string;
  grade: string;
  overallScore: number;
  seo: PillarScore;
  performance: PillarScore;
  security: PillarScore;
  accessibility: PillarScore;
  meta: AuditMeta;
}

export interface AuditResponse {
  success: boolean;
  cached: boolean;
  cachedAt?: string;
  expiresInSeconds?: number;
  data: AuditReport;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    timestamp: string;
    requestId?: string;
  };
}

type Tab = 'audit' | 'results' | 'architecture' | 'api-docs';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('audit');
  const [auditResult, setAuditResult] = useState<AuditResponse | null>(null);
  const [requestId, setRequestId] = useState<string>('');
  const [error, setError] = useState<ErrorResponse | null>(null);

  const handleAuditComplete = (
    result: AuditResponse,
    reqId: string,
  ) => {
    setAuditResult(result);
    setRequestId(reqId);
    setError(null);
    setActiveTab('results');
  };

  const handleAuditError = (err: ErrorResponse) => {
    setError(err);
    setAuditResult(null);
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'audit', label: 'Live Audit', icon: <Search /> },
    { key: 'results', label: 'Results', icon: <BarChart3 /> },
    { key: 'architecture', label: 'Scale Architecture', icon: <Server /> },
    { key: 'api-docs', label: 'API Docs', icon: <BookOpen /> },
  ];

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-badge-wrapper">
          <div className="badge-editorial">
            <span className="badge-dot" />
            <span>Digital Heroes · Audit Engine // v1.0</span>
          </div>
        </div>
        <div className="app-logo">
          <div className="app-logo-icon">
            <Activity size={28} />
          </div>
          <h1 className="app-title">Page Pulse</h1>
        </div>
        <p className="app-subtitle">
          Editorial-quality URL audit service — analyzing web pages for <span className="serif">SEO</span>, <span className="serif">Performance</span>, <span className="serif">Security</span>, and <span className="serif">Accessibility</span>.
        </p>
      </header>

      {/* Navigation */}
      <nav className="nav-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`nav-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.icon}
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Content */}
      <main style={{ flex: 1 }}>
        {activeTab === 'audit' && (
          <AuditDashboard
            onComplete={handleAuditComplete}
            onError={handleAuditError}
            error={error}
          />
        )}
        {activeTab === 'results' && (
          <AuditResults
            result={auditResult}
            requestId={requestId}
          />
        )}
        {activeTab === 'architecture' && <ScaleArchitecture />}
        {activeTab === 'api-docs' && <ApiDocs />}
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
