/**
 * In-memory rate limiter for API routes.
 *
 * Uses a sliding-window counter per IP address. Suitable for single-instance
 * deployments (Vercel serverless functions may need an external store like
 * Upstash Redis for distributed rate limiting, but this covers the common case).
 *
 * Usage:
 *   import { checkRateLimit } from "@/lib/rate-limit";
 *
 *   const result = checkRateLimit(request, { windowMs: 60_000, max: 10 });
 *   if (!result.allowed) {
 *     return NextResponse.json({ error: "Rate limit exceeded" }, {
 *       status: 429,
 *       headers: { "Retry-After": String(result.retryAfterSec) }
 *     });
 *   }
 */

interface RateLimitConfig {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum requests per window */
  max: number;
  /** Optional key prefix for namespacing (e.g. "ai", "upload") */
  prefix?: string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

const store = new Map<string, RateLimitEntry>();

// Periodic cleanup of expired entries (every 5 minutes)
let lastCleanup = Date.now();
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 5 * 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}

/** Extract client IP from a Next.js request. */
function getClientIP(req: Request): string {
  const headers = new Headers(req.headers);
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Check rate limit for a request. Returns whether the request is allowed
 * and metadata for rate-limit headers.
 */
export function checkRateLimit(
  req: Request,
  config: RateLimitConfig,
): RateLimitResult {
  cleanup();
  const ip = getClientIP(req);
  const key = `${config.prefix ?? "default"}:${ip}`;
  const now = Date.now();
  const windowMs = config.windowMs;

  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    // New window
    store.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      remaining: config.max - 1,
      retryAfterSec: 0,
    };
  }

  entry.count++;
  const remaining = Math.max(0, config.max - entry.count);
  const allowed = entry.count <= config.max;
  const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);

  return { allowed, remaining, retryAfterSec: Math.max(0, retryAfterSec) };
}

/**
 * Convenience: standard rate limit configs.
 */
export const RATE_LIMITS = {
  /** Default AI routes: 10 requests per minute per IP */
  ai: { windowMs: 60_000, max: 10, prefix: "ai" },
  /** Luma (Normal Chatbot): fast chat, 15/min */
  luma: { windowMs: 60_000, max: 15, prefix: "luma" },
  /** Ouro (Study Buddy): heavier structured outputs, 8/min */
  ouro: { windowMs: 60_000, max: 8, prefix: "ouro" },
  /** Ankaa (Agent): long-form, expensive, 3/min */
  ankaa: { windowMs: 60_000, max: 3, prefix: "ankaa" },
  /** Upload: 5 uploads per minute per IP */
  upload: { windowMs: 60_000, max: 5, prefix: "upload" },
  /** Document read: 60 requests per minute per IP */
  read: { windowMs: 60_000, max: 60, prefix: "read" },
  /** General API: 120 requests per minute per IP */
  general: { windowMs: 60_000, max: 120, prefix: "general" },
} as const;

/**
 * Apply rate limit headers to a NextResponse.
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(RATE_LIMITS.ai.max),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(Date.now() / 1000) + result.retryAfterSec),
  };
}
