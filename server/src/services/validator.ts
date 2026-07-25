// ─── URL Validator & SSRF Protection ────────────────────────────────────────
// Validates incoming URLs using Zod and prevents Server-Side Request Forgery
// by resolving the hostname to its IP addresses and blocking any that fall
// within private, loopback, link-local, or cloud-metadata ranges.

import { z } from 'zod';
import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { ValidationError, SSRFError } from '../utils/errors.js';

// ── Zod schema ──────────────────────────────────────────────────────────────

const urlSchema = z
  .string()
  .trim()
  .min(1, 'URL must not be empty')
  .url('Value must be a valid URL')
  .refine(
    (u) => {
      try {
        const parsed = new URL(u);
        return ['http:', 'https:'].includes(parsed.protocol);
      } catch {
        return false;
      }
    },
    { message: 'Only http and https protocols are allowed' },
  );

// ── SSRF-blocked IP ranges ─────────────────────────────────────────────────

const BLOCKED_RANGES: Array<[ipaddr.IPv4 | ipaddr.IPv6, number]> = [
  // Loopback
  [ipaddr.IPv4.parse('127.0.0.0'), 8],
  // Private networks
  [ipaddr.IPv4.parse('10.0.0.0'), 8],
  [ipaddr.IPv4.parse('172.16.0.0'), 12],
  [ipaddr.IPv4.parse('192.168.0.0'), 16],
  // Link-local / cloud metadata
  [ipaddr.IPv4.parse('169.254.0.0'), 16],
  // IPv6 loopback
  [ipaddr.IPv6.parse('::1'), 128],
  // IPv6 link-local
  [ipaddr.IPv6.parse('fe80::'), 10],
  // IPv6 unique-local
  [ipaddr.IPv6.parse('fc00::'), 7],
];

function isBlockedIp(ip: string): boolean {
  try {
    const addr = ipaddr.process(ip);

    for (const [network, prefixLen] of BLOCKED_RANGES) {
      // Ensure we're comparing the same address kind
      if (addr.kind() === network.kind()) {
        if (addr.match(network, prefixLen)) {
          return true;
        }
      }
    }
    return false;
  } catch {
    // Unparseable address → block conservatively
    return true;
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface ValidatedUrl {
  /** The original URL string (trimmed) */
  raw: string;
  /** Parsed URL object */
  parsed: URL;
}

/**
 * Validate and SSRF-check an incoming URL string.
 *
 * @throws {ValidationError} if the URL format is invalid
 * @throws {SSRFError}       if the resolved IP is in a blocked range
 */
export async function validateUrl(raw: unknown): Promise<ValidatedUrl> {
  // 1) Format validation via Zod
  const result = urlSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => i.message);
    throw new ValidationError('Invalid URL', issues);
  }

  const urlString = result.data;
  const parsed = new URL(urlString);

  // 2) DNS resolution → SSRF check
  try {
    const { address } = await dns.lookup(parsed.hostname);
    if (isBlockedIp(address)) {
      throw new SSRFError(
        `Blocked: ${parsed.hostname} resolves to a restricted address (${address})`,
      );
    }
  } catch (err) {
    if (err instanceof SSRFError) throw err;
    throw new ValidationError(`DNS lookup failed for hostname "${parsed.hostname}"`, {
      hostname: parsed.hostname,
    });
  }

  return { raw: urlString, parsed };
}
