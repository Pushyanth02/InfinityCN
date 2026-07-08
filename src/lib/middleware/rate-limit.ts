/**
 * Simple in-memory rate limiter (token bucket per IP).
 *
 * Redis: the ONLY implemented use of REDIS_URL today. When set, rate-limit
 * counters live in Redis (atomic Lua fixed-window script) so state survives
 * restarts and is shared across instances; otherwise an in-memory Map is used
 * (state is lost on restart and is per-process).
 *
 * NOTE: REDIS_URL does NOT enable Redis-backed job queue coordination — the
 * queue remains the SQLite `Job` table with CAS claiming regardless. See
 * docs/ARCHITECTURE.md ("No Redis") and CLAUDE.md. Redis queueing is a
 * reserved, unimplemented seam.
 */

import Redis from 'ioredis'
import { createLogger } from '../logger'

const logger = createLogger('rate-limit')

// Log startup warning about ephemeral state
if (process.env.NODE_ENV === 'production' && !process.env.REDIS_URL) {
  logger.warn(
    'Rate limiter is using in-memory storage. State will be lost on restart. ' +
    'Consider deploying with Redis (REDIS_URL) for persistent rate limiting.',
  )
}

let redisClient: Redis | null = null
if (process.env.REDIS_URL) {
  try {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
    })
    redisClient.on('error', (err) => {
      logger.error('Redis error (falling back to memory)', { error: err.message })
    })
    logger.info('Redis rate limiter initialized', {
      url: process.env.REDIS_URL.replace(/:[^:@]+@/, ':***@'),
    })
  } catch (err) {
    logger.error('Failed to initialize Redis client', { error: (err as Error).message })
  }
}

const buckets = new Map<string, { tokens: number; lastRefill: number; max: number }>()
const REFILL_INTERVAL_MS = 60_000

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetMs: number
}

// Lua script for atomic sliding/fixed window rate limit
const LUA_LIMIT_SCRIPT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])

local current = redis.call('get', key)
if current and tonumber(current) >= limit then
    local pttl = redis.call('pttl', key)
    return {0, 0, pttl}
else
    local newVal = redis.call('incr', key)
    if newVal == 1 then
        redis.call('pexpire', key, window)
    end
    local pttl = redis.call('pttl', key)
    local remaining = limit - newVal
    return {1, remaining, pttl}
end
`

export async function rateLimit(key: string, maxPerMinute = 10): Promise<RateLimitResult> {
  if (redisClient) {
    try {
      const result = (await redisClient.eval(
        LUA_LIMIT_SCRIPT,
        1,
        key,
        String(maxPerMinute),
        String(REFILL_INTERVAL_MS),
      )) as [number, number, number]

      const [allowed, remaining, pttl] = result
      const pttlVal = Number(pttl)
      const resetMs = pttlVal > 0 ? pttlVal : REFILL_INTERVAL_MS

      return {
        allowed: allowed === 1,
        remaining: Number(remaining),
        resetMs,
      }
    } catch (err) {
      logger.warn('Redis rate limit execution failed, falling back to memory', {
        error: (err as Error).message,
      })
    }
  }

  // Memory fallback
  const now = Date.now()
  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = { tokens: maxPerMinute, lastRefill: now, max: maxPerMinute }
    buckets.set(key, bucket)
  }
  const elapsed = now - bucket.lastRefill
  const refill = Math.floor(elapsed / REFILL_INTERVAL_MS)
  if (refill > 0) {
    bucket.tokens = Math.min(bucket.max, bucket.tokens + refill)
    bucket.lastRefill = now
  }
  const resetMs = REFILL_INTERVAL_MS - (now - bucket.lastRefill)
  if (bucket.tokens <= 0) return { allowed: false, remaining: 0, resetMs }
  bucket.tokens -= 1
  return { allowed: true, remaining: bucket.tokens, resetMs }
}

// ---------------------------------------------------------------------------
// Trusted Proxy Configuration
// ---------------------------------------------------------------------------

/**
 * Default trusted proxies: localhost only (safe default for direct exposure).
 * In Docker/production behind a reverse proxy (Caddy, nginx, etc.), set
 * LEMNISCATE_TRUSTED_PROXY_CIDR to the proxy's subnet (e.g. 172.16.0.0/12)
 * so X-Forwarded-For is trusted for accurate per-IP rate limiting.
 *
 * Without this, all Docker traffic appears to come from the proxy container's
 * internal IP, making per-IP rate limits ineffective (all clients share one bucket).
 */
const DEFAULT_TRUSTED_PROXIES = ['127.0.0.1', '::1']
const configuredCIDRs = process.env.LEMNISCATE_TRUSTED_PROXY_CIDR
  ? process.env.LEMNISCATE_TRUSTED_PROXY_CIDR.split(',').map((s) => s.trim()).filter(Boolean)
  : []

const trustedIPs = new Set<string>([...DEFAULT_TRUSTED_PROXIES])
const trustedCIDRs: { base: number; mask: number }[] = []

for (const entry of configuredCIDRs) {
  if (entry.includes('/')) {
    const parsed = parseCIDR(entry)
    if (parsed) trustedCIDRs.push(parsed)
    else logger.warn('Invalid CIDR in LEMNISCATE_TRUSTED_PROXY_CIDR, ignoring', { cidr: entry })
  } else {
    trustedIPs.add(entry)
  }
}

/**
 * Get the client IP address from the request, trusting proxy headers
 * only when the connection originates from a configured trusted proxy.
 */
export function getClientIP(req: Request): string {
  const remoteAddr =
    (req as Request & { socket?: { remoteAddress?: string } }).socket?.remoteAddress || ''

  if (isTrustedProxy(remoteAddr)) {
    const forwarded = req.headers.get('x-forwarded-for')
    if (forwarded) return forwarded.split(',')[0].trim()
    const realIP = req.headers.get('x-real-ip')
    if (realIP) return realIP
  }
  return remoteAddr || 'unknown'
}

/**
 * Check if an IP address belongs to a trusted proxy.
 * Handles IPv4-mapped IPv6 addresses (::ffff:127.0.0.1).
 */
function isTrustedProxy(ip: string): boolean {
  if (trustedIPs.has(ip)) return true
  // Normalize IPv4-mapped IPv6
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip
  if (trustedIPs.has(normalized)) return true
  return trustedCIDRs.some((c) => isInCIDR(normalized, c))
}

/** Parse a CIDR notation string into a base/mask pair for range checking. */
function parseCIDR(cidr: string): { base: number; mask: number } | null {
  const [ipPart, maskPart] = cidr.split('/')
  const mask = parseInt(maskPart || '32', 10)
  if (isNaN(mask) || mask < 0 || mask > 32) return null

  const parts = ipPart.split('.')
  if (parts.length !== 4) return null

  const base = parts.reduce((acc, octet) => {
    const val = parseInt(octet, 10)
    if (isNaN(val) || val < 0 || val > 255) return acc
    return ((acc << 8) + val) >>> 0
  }, 0) >>> 0

  return { base, mask }
}

/** Check if an IPv4 address falls within a CIDR range. */
function isInCIDR(ip: string, cidr: { base: number; mask: number }): boolean {
  const parts = ip.split('.')
  if (parts.length !== 4) return false

  const ipNum = parts.reduce((acc, octet) => {
    const val = parseInt(octet, 10)
    if (isNaN(val) || val < 0 || val > 255) return 0
    return ((acc << 8) + val) >>> 0
  }, 0) >>> 0

  const maskBits = cidr.mask === 0 ? 0 : (0xFFFFFFFF << (32 - cidr.mask)) >>> 0
  return (ipNum & maskBits) === (cidr.base & maskBits)
}

const cleanupInterval = setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastRefill > 10 * 60 * 1000) buckets.delete(key)
  }
}, 5 * 60 * 1000)
cleanupInterval.unref?.()