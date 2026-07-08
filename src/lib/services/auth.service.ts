/**
 * Lemniscate — Authentication Service
 * ----------------------------------------------------------------------------
 * Centralized authentication and authorization logic. Today: API key auth
 * (shared secret). Designed for pluggable auth providers (Supabase Auth,
 * OAuth, JWT) behind an interface.
 *
 * This service wraps the existing security middleware into a clean service
 * that API routes and middleware can consume uniformly.
 */

import { timingSafeEqual } from 'node:crypto'
import { AuthenticationError } from '@/lib/domain/errors'
import { createLogger } from '@/lib/logger'

const logger = createLogger('auth-service')

// ─── Types ────────────────────────────────────────────────────────────────

export interface AuthPrincipal {
  type: 'api-key' | 'browser' | 'anonymous'
  id: string
  origin?: string
}

export interface AuthContext {
  principal: AuthPrincipal
  isAuthenticated: boolean
}

// ─── Configuration ────────────────────────────────────────────────────────

const API_KEY = process.env.LEMNISCATE_API_KEY
const ALLOWED_ORIGINS = process.env.LEMNISCATE_ALLOWED_ORIGINS
  ? process.env.LEMNISCATE_ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : null

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Constant-time string comparison to prevent timing attacks. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

// ─── Service methods ──────────────────────────────────────────────────────

/**
 * Authenticate a request and return the principal context.
 * Throws AuthenticationError if authentication fails.
 */
export function authenticate(req: Request): AuthContext {
  // If no API key configured, auth is disabled (dev mode)
  if (!API_KEY) {
    return {
      principal: { type: 'anonymous', id: 'anonymous' },
      isAuthenticated: true,
    }
  }

  // Check Bearer token
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ') && safeEqual(authHeader.slice(7), API_KEY)) {
    return {
      principal: { type: 'api-key', id: 'api-key-holder' },
      isAuthenticated: true,
    }
  }

  // Check x-api-key header
  const apiKeyHeader = req.headers.get('x-api-key')
  if (apiKeyHeader && safeEqual(apiKeyHeader, API_KEY)) {
    return {
      principal: { type: 'api-key', id: 'api-key-holder' },
      isAuthenticated: true,
    }
  }

  // Check trusted first-party browser request
  if (isTrustedFirstParty(req)) {
    return {
      principal: { type: 'browser', id: 'browser', origin: req.headers.get('origin') ?? undefined },
      isAuthenticated: true,
    }
  }

  throw new AuthenticationError('Authentication required')
}

/**
 * Authorize a principal to perform an action on a resource.
 * Today: all authenticated principals have full access (single-user deployment).
 * Future: role-based access control, per-resource permissions.
 */
export function authorize(
  _principal: AuthPrincipal,
  _action: string,
  _resourceType?: string,
  _resourceId?: string,
): void {
  // In single-user mode, authentication IS authorization.
  // This method exists as the extension point for multi-tenant RBAC.
}

/**
 * Validate CSRF token for state-changing requests.
 */
export function validateCSRF(req: Request): boolean {
  if (!ALLOWED_ORIGINS) return true // CSRF check disabled in dev
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return true

  const origin = req.headers.get('origin')
  if (origin && ALLOWED_ORIGINS.includes(origin)) return true

  const referer = req.headers.get('referer')
  if (referer) {
    try {
      if (ALLOWED_ORIGINS.includes(new URL(referer).origin)) return true
    } catch {
      /* malformed referer */
    }
  }

  return false
}

/**
 * Check if a request comes from a trusted first-party browser.
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
      /* malformed referer */
    }
  }

  const secFetchSite = req.headers.get('sec-fetch-site')
  if (secFetchSite === 'same-origin' || secFetchSite === 'same-site') return true

  return false
}

/**
 * Ensure authentication is enforced in production.
 */
export function enforceProductionAuth(): void {
  if (process.env.NODE_ENV === 'production' && !API_KEY) {
    logger.error('LEMNISCATE_API_KEY is not set in production')
    throw new Error('[FATAL] LEMNISCATE_API_KEY must be set in production')
  }
}
