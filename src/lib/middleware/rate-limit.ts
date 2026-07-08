/**
 * Simple in-memory rate limiter (token bucket per IP).
 * No external dependencies — deterministic and offline.
 *
 * Note: State is ephemeral — lost on process restart (spec 2.4).
 * A persistent backend (Redis) should be used for production at scale.
 */

import { createLogger } from '../logger'

const logger = createLogger('rate-limit')

// Log startup warning about ephemeral state
if (process.env.NODE_ENV === 'production') {
  logger.warn(
    'Rate limiter is using in-memory storage. State will be lost on restart. ' +
    'Consider deploying with Redis (REDIS_URL) for persistent rate limiting.',
  )
}

const buckets = new Map<string, { tokens: number; lastRefill: number; max: number }>()
const REFILL_INTERVAL_MS = 60_000

export function rateLimit(key: string, maxPerMinute = 10): boolean {
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
  if (bucket.tokens <= 0) return false
  bucket.tokens -= 1
  return true
}

/** Get client IP — only trusts X-Forwarded-For from localhost proxy */
export function getClientIP(req: Request): string {
  const remoteAddr =
    (req as Request & { socket?: { remoteAddress?: string } }).socket?.remoteAddress || ''
  const trustedProxies = ['127.0.0.1', '::1']
  if (trustedProxies.includes(remoteAddr)) {
    const forwarded = req.headers.get('x-forwarded-for')
    if (forwarded) return forwarded.split(',')[0].trim()
    const realIP = req.headers.get('x-real-ip')
    if (realIP) return realIP
  }
  return remoteAddr || 'unknown'
}

const cleanupInterval = setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastRefill > 10 * 60 * 1000) buckets.delete(key)
  }
}, 5 * 60 * 1000)
cleanupInterval.unref?.()
