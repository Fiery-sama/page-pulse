// ─── Core Audit Engine ──────────────────────────────────────────────────────
// Fetches a target URL with timeout enforcement (AbortController) and
// analyses the response across four audit pillars:
//   1. SEO          – title, meta description, OG tags, canonical, headings
//   2. Performance  – TTFB, download time, payload size, compression, assets
//   3. Security     – HSTS, CSP, X-Frame-Options, X-Content-Type-Options, HTTPS
//   4. Accessibility – img alt coverage, viewport, lang attr, link text

import * as cheerio from 'cheerio';
import { config } from '../config.js';
import { AuditTimeoutError, FetchError } from '../utils/errors.js';
import { withConcurrencyLimit } from './concurrencyLimiter.js';

// ── Types ───────────────────────────────────────────────────────────────────

export interface Finding {
  rule: string;
  pass: boolean;
  message: string;
  impact: 'critical' | 'major' | 'minor' | 'info';
}

export interface PillarScore {
  score: number;       // 0–100
  findings: Finding[];
}

export interface AuditReport {
  url: string;
  grade: string;       // A+ … F
  overallScore: number; // 0–100
  seo: PillarScore;
  performance: PillarScore;
  security: PillarScore;
  accessibility: PillarScore;
  meta: {
    fetchedAt: string;
    ttfbMs: number;
    totalTimeMs: number;
    contentLengthBytes: number;
    httpStatus: number;
  };
}

// ── Grading table ───────────────────────────────────────────────────────────

function computeGrade(score: number): string {
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  if (score >= 70) return 'C-';
  if (score >= 67) return 'D+';
  if (score >= 63) return 'D';
  if (score >= 60) return 'D-';
  return 'F';
}

// ── Pillar auditors ─────────────────────────────────────────────────────────

function auditSeo($: cheerio.CheerioAPI, _url: string): PillarScore {
  const findings: Finding[] = [];

  // Title
  const title = $('title').first().text().trim();
  if (title) {
    const len = title.length;
    if (len >= 30 && len <= 60) {
      findings.push({ rule: 'title-tag', pass: true, message: `Title tag present (${len} chars)`, impact: 'info' });
    } else {
      findings.push({ rule: 'title-length', pass: false, message: `Title length is ${len} chars; ideal range is 30-60`, impact: 'minor' });
    }
  } else {
    findings.push({ rule: 'title-tag', pass: false, message: 'Missing <title> tag', impact: 'critical' });
  }

  // Meta description
  const metaDesc = $('meta[name="description"]').attr('content')?.trim();
  if (metaDesc) {
    const len = metaDesc.length;
    if (len >= 50 && len <= 160) {
      findings.push({ rule: 'meta-description', pass: true, message: `Meta description present (${len} chars)`, impact: 'info' });
    } else {
      findings.push({ rule: 'meta-description-length', pass: false, message: `Meta description is ${len} chars; ideal range is 50-160`, impact: 'minor' });
    }
  } else {
    findings.push({ rule: 'meta-description', pass: false, message: 'Missing meta description', impact: 'major' });
  }

  // Open Graph tags
  const ogTitle = $('meta[property="og:title"]').attr('content');
  const ogDesc = $('meta[property="og:description"]').attr('content');
  const ogImage = $('meta[property="og:image"]').attr('content');
  if (ogTitle && ogDesc && ogImage) {
    findings.push({ rule: 'open-graph', pass: true, message: 'Open Graph tags (title, description, image) are present', impact: 'info' });
  } else {
    const missing = [!ogTitle && 'og:title', !ogDesc && 'og:description', !ogImage && 'og:image'].filter(Boolean);
    findings.push({ rule: 'open-graph', pass: false, message: `Missing Open Graph tags: ${missing.join(', ')}`, impact: 'minor' });
  }

  // Canonical URL
  const canonical = $('link[rel="canonical"]').attr('href');
  findings.push(
    canonical
      ? { rule: 'canonical-url', pass: true, message: `Canonical URL defined: ${canonical}`, impact: 'info' }
      : { rule: 'canonical-url', pass: false, message: 'No canonical URL specified', impact: 'minor' },
  );

  // Heading structure — single H1
  const h1Count = $('h1').length;
  if (h1Count === 1) {
    findings.push({ rule: 'single-h1', pass: true, message: 'Exactly one <h1> tag found', impact: 'info' });
  } else if (h1Count === 0) {
    findings.push({ rule: 'single-h1', pass: false, message: 'No <h1> tag found on the page', impact: 'major' });
  } else {
    findings.push({ rule: 'single-h1', pass: false, message: `Multiple <h1> tags found (${h1Count}); use exactly one`, impact: 'minor' });
  }

  const score = computePillarScore(findings);
  return { score, findings };
}

function auditPerformance(
  headers: Record<string, string>,
  bodyLength: number,
  ttfbMs: number,
  totalTimeMs: number,
  $: cheerio.CheerioAPI,
): PillarScore {
  const findings: Finding[] = [];

  // TTFB
  if (ttfbMs < 200) {
    findings.push({ rule: 'ttfb', pass: true, message: `TTFB is fast (${ttfbMs}ms)`, impact: 'info' });
  } else if (ttfbMs < 600) {
    findings.push({ rule: 'ttfb', pass: true, message: `TTFB is acceptable (${ttfbMs}ms)`, impact: 'minor' });
  } else {
    findings.push({ rule: 'ttfb', pass: false, message: `TTFB is slow (${ttfbMs}ms); aim for <200ms`, impact: 'major' });
  }

  // Total download time
  if (totalTimeMs < 1000) {
    findings.push({ rule: 'download-time', pass: true, message: `Page downloaded in ${totalTimeMs}ms`, impact: 'info' });
  } else {
    findings.push({ rule: 'download-time', pass: false, message: `Slow download (${totalTimeMs}ms); aim for <1000ms`, impact: 'minor' });
  }

  // Payload size
  const sizeKb = Math.round(bodyLength / 1024);
  if (sizeKb < 200) {
    findings.push({ rule: 'payload-size', pass: true, message: `Page size is lean (${sizeKb} KB)`, impact: 'info' });
  } else if (sizeKb < 500) {
    findings.push({ rule: 'payload-size', pass: false, message: `Page size is moderate (${sizeKb} KB); consider optimisation`, impact: 'minor' });
  } else {
    findings.push({ rule: 'payload-size', pass: false, message: `Page is heavy (${sizeKb} KB); target <200 KB`, impact: 'major' });
  }

  // Compression
  const encoding = headers['content-encoding'] ?? '';
  const compressed = /gzip|br|deflate/i.test(encoding);
  findings.push(
    compressed
      ? { rule: 'compression', pass: true, message: `Compression enabled (${encoding})`, impact: 'info' }
      : { rule: 'compression', pass: false, message: 'No compression detected (gzip/brotli); enable it on the server', impact: 'major' },
  );

  // Script & stylesheet count
  const scriptCount = $('script[src]').length;
  const styleCount = $('link[rel="stylesheet"]').length;
  if (scriptCount + styleCount <= 10) {
    findings.push({ rule: 'asset-count', pass: true, message: `${scriptCount} external scripts, ${styleCount} stylesheets`, impact: 'info' });
  } else {
    findings.push({ rule: 'asset-count', pass: false, message: `Too many external assets (${scriptCount} scripts, ${styleCount} stylesheets); consider bundling`, impact: 'minor' });
  }

  const score = computePillarScore(findings);
  return { score, findings };
}

function auditSecurity(headers: Record<string, string>, url: string): PillarScore {
  const findings: Finding[] = [];
  const isHttps = url.startsWith('https://');

  // HTTPS
  findings.push(
    isHttps
      ? { rule: 'https', pass: true, message: 'Page served over HTTPS', impact: 'info' }
      : { rule: 'https', pass: false, message: 'Page not served over HTTPS', impact: 'critical' },
  );

  // Strict-Transport-Security
  const hsts = headers['strict-transport-security'];
  findings.push(
    hsts
      ? { rule: 'hsts', pass: true, message: `HSTS header present: ${hsts}`, impact: 'info' }
      : { rule: 'hsts', pass: false, message: 'Missing Strict-Transport-Security header', impact: 'major' },
  );

  // Content-Security-Policy
  const csp = headers['content-security-policy'];
  findings.push(
    csp
      ? { rule: 'csp', pass: true, message: 'Content-Security-Policy header present', impact: 'info' }
      : { rule: 'csp', pass: false, message: 'Missing Content-Security-Policy header', impact: 'major' },
  );

  // X-Frame-Options
  const xFrame = headers['x-frame-options'];
  findings.push(
    xFrame
      ? { rule: 'x-frame-options', pass: true, message: `X-Frame-Options: ${xFrame}`, impact: 'info' }
      : { rule: 'x-frame-options', pass: false, message: 'Missing X-Frame-Options header (clickjacking risk)', impact: 'minor' },
  );

  // X-Content-Type-Options
  const xcto = headers['x-content-type-options'];
  findings.push(
    xcto
      ? { rule: 'x-content-type-options', pass: true, message: `X-Content-Type-Options: ${xcto}`, impact: 'info' }
      : { rule: 'x-content-type-options', pass: false, message: 'Missing X-Content-Type-Options header', impact: 'minor' },
  );

  const score = computePillarScore(findings);
  return { score, findings };
}

function auditAccessibility($: cheerio.CheerioAPI): PillarScore {
  const findings: Finding[] = [];

  // Image alt coverage
  const images = $('img');
  const totalImages = images.length;
  if (totalImages === 0) {
    findings.push({ rule: 'img-alt', pass: true, message: 'No images found (nothing to check)', impact: 'info' });
  } else {
    const withAlt = images.filter((_i, el) => {
      const alt = $(el).attr('alt');
      return alt !== undefined && alt.trim().length > 0;
    }).length;
    const pct = Math.round((withAlt / totalImages) * 100);
    if (pct === 100) {
      findings.push({ rule: 'img-alt', pass: true, message: `All ${totalImages} images have alt text`, impact: 'info' });
    } else {
      findings.push({ rule: 'img-alt', pass: false, message: `${withAlt}/${totalImages} images have alt text (${pct}%)`, impact: 'major' });
    }
  }

  // Viewport meta tag
  const viewport = $('meta[name="viewport"]').attr('content');
  findings.push(
    viewport
      ? { rule: 'viewport', pass: true, message: 'Viewport meta tag present', impact: 'info' }
      : { rule: 'viewport', pass: false, message: 'Missing viewport meta tag (mobile accessibility)', impact: 'major' },
  );

  // HTML lang attribute
  const lang = $('html').attr('lang');
  findings.push(
    lang
      ? { rule: 'html-lang', pass: true, message: `HTML lang attribute set: "${lang}"`, impact: 'info' }
      : { rule: 'html-lang', pass: false, message: 'Missing lang attribute on <html>', impact: 'major' },
  );

  // Link text accessibility — links with no text / "click here"
  const links = $('a');
  let emptyLinks = 0;
  links.each((_i, el) => {
    const text = $(el).text().trim();
    const ariaLabel = $(el).attr('aria-label')?.trim();
    if (!text && !ariaLabel) emptyLinks++;
  });
  if (emptyLinks === 0) {
    findings.push({ rule: 'link-text', pass: true, message: 'All links have accessible text', impact: 'info' });
  } else {
    findings.push({ rule: 'link-text', pass: false, message: `${emptyLinks} link(s) have no accessible text or aria-label`, impact: 'minor' });
  }

  const score = computePillarScore(findings);
  return { score, findings };
}

// ── Scoring helper ──────────────────────────────────────────────────────────

function computePillarScore(findings: Finding[]): number {
  if (findings.length === 0) return 100;

  const weights: Record<Finding['impact'], number> = {
    critical: 25,
    major: 15,
    minor: 5,
    info: 0,
  };

  let deductions = 0;
  for (const f of findings) {
    if (!f.pass) {
      deductions += weights[f.impact];
    }
  }

  return Math.max(0, Math.min(100, 100 - deductions));
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Execute a full audit against the given URL.
 * Runs under the concurrency limiter and enforces a configurable timeout.
 */
export async function runAudit(url: string): Promise<AuditReport> {
  return withConcurrencyLimit(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.auditTimeoutMs);

    const start = performance.now();
    let ttfbMs = 0;

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'PagePulse/1.0 (URL Audit Service)',
          Accept: 'text/html,application/xhtml+xml,*/*',
        },
        redirect: 'follow',
      });

      ttfbMs = Math.round(performance.now() - start);
      const body = await response.text();
      const totalTimeMs = Math.round(performance.now() - start);
      clearTimeout(timer);

      // Normalise response headers into a plain object
      const headers: Record<string, string> = {};
      response.headers.forEach((value: string, key: string) => {
        headers[key.toLowerCase()] = value;
      });

      const $ = cheerio.load(body);

      const seo = auditSeo($, url);
      const perf = auditPerformance(headers, body.length, ttfbMs, totalTimeMs, $);
      const security = auditSecurity(headers, url);
      const accessibility = auditAccessibility($);

      // Weighted overall score (equal weight per pillar)
      const overallScore = Math.round(
        (seo.score + perf.score + security.score + accessibility.score) / 4,
      );

      return {
        url,
        grade: computeGrade(overallScore),
        overallScore,
        seo,
        performance: perf,
        security,
        accessibility,
        meta: {
          fetchedAt: new Date().toISOString(),
          ttfbMs,
          totalTimeMs,
          contentLengthBytes: body.length,
          httpStatus: response.status,
        },
      };
    } catch (err: unknown) {
      clearTimeout(timer);

      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new AuditTimeoutError(url, config.auditTimeoutMs);
      }

      const message = err instanceof Error ? err.message : String(err);
      throw new FetchError(url, message);
    }
  });
}
