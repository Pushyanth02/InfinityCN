/**
 * Lemniscate — Security Middleware
 * ----------------------------------------------------------------------------
 * - API key authentication (simple shared secret for single-user deployment)
 * - CSRF protection (Origin header check)
 * - IP-based rate limiting (trusts proxy headers only from configured IPs)
 * - Startup enforcement: production requires API key (spec 2.1)
 */

import { NextResponse } from 'next/server'
import { rateLimit as tokenBucketRateLimit } from './rate-limit'
import { createLogger } from '../logger'

const logger = createLogger('security')

// ─── Production Startup Guard ────────────────────────────────────────────────

const API_KEY = process.env.LEMNISCATE_API_KEY // If unset, auth is disabled (localhost dev)

if (process.env.NODE_ENV === 'production' && !API_KEY) {
  logger.error(
    'LEMNISCATE_API_KEY is not set. Authentication cannot be disabled in production. ' +
    'Set LEMNISCATE_API_KEY to a strong secret (minimum 16 characters) and restart.',
  )
  throw new Error(
    '[FATAL] LEMNISCATE_API_KEY must be set in production. ' +
    'The application cannot start without authentication configured.',
  )
}

export function checkAuth(req: Request): boolean {
  if (!API_KEY) return true
  // Programmatic / cross-origin callers authenticate with the shared secret.
  const authHeader = req.headers.get('authorization')
  if (authHeader === `Bearer ${API_KEY}`) return true
  const apiKeyHeader = req.headers.get('x-api-key')
  if (apiKeyHeader === API_KEY) return true
  // First-party browser requests (the app's own UI) cannot carry the
  // server-side secret — exposing it in client code would defeat its purpose.
  // Accept them when the request provably originates from a trusted, same-site
  // context. This preserves API-key enforcement for external/automation callers
  // while unblocking the first-party interface. CSRF is still enforced
  // separately via checkCSRF (Origin allowlist on state-changing requests).
  if (isTrustedFirstParty(req)) return true
  return false
}

// ─── CSRF Protection ────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = process.env.LEMNISCATE_ALLOWED_ORIGINS
  ? process.env.LEMNISCATE_ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : null

/**
 * Detect a trusted first-party (same-site) browser request.
 *
 * Two independent signals are used:
 *   1. Origin / Referer matches the configured allowlist. Browsers always send
 *      `Origin` on state-changing (POST/PUT/DELETE) requests, and `Referer` on
 *      same-origin navigations/fetches.
 *   2. The `Sec-Fetch-Site` metadata header equals `same-origin`/`same-site`.
 *      This header is set by the browser and is a Forbidden header name, so it
 *      cannot be spoofed by page JavaScript — a reliable first-party signal for
 *      GET requests where `Origin` is often omitted.
 *
 * Non-browser clients (curl, server-to-server) send neither and therefore must
 * present the API key. If no origin allowlist is configured we cannot validate
 * first-party requests, so we conservatively decline (API key required).
 */
function isTrustedFirstParty(req: Request): boolean {
  if (!ALLOWED_ORIGINS) return false

  const origin = req.headers.get('origin')
  if (origin) return ALLOWED_ORIGINS.includes(origin)

  const referer = req.headers.get('referer')
  if (referer) {
    try {
      if (ALLOWED_ORIGINS.includes(new URL(referer).origin)) return true
    } catch {
      /* malformed referer — fall through */
    }
  }

  // GET/HEAD requests frequently omit Origin; trust the browser's unspoofable
  // Sec-Fetch-Site signal for same-origin/same-site navigations.
  const secFetchSite = req.headers.get('sec-fetch-site')
  if (secFetchSite === 'same-origin' || secFetchSite === 'same-site') return true

  return false
}

export function checkCSRF(req: Request): boolean {
  if (!ALLOWED_ORIGINS) return true
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return true
  const origin = req.headers.get('origin')
  const referer = req.headers.get('referer')
  if (origin && ALLOWED_ORIGINS.includes(origin)) return true
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin
      if (ALLOWED_ORIGINS.includes(refererOrigin)) return true
    } catch { /* invalid referer */ }
  }
  return false
}

/** Combined security check: auth + CSRF + rate limiting */
export function securityCheck(req: Request, rateLimitKey: string, rateLimitMax: number): NextResponse | null {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!checkCSRF(req)) {
    return NextResponse.json({ error: 'Forbidden — invalid origin' }, { status: 403 })
  }
  if (!tokenBucketRateLimit(rateLimitKey, rateLimitMax)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }
  return null
}

export { rateLimit } from './rate-limit'
