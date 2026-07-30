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

/** Read a positive integer from the environment, falling back to a default. */
function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

/**
 * Convenience: standard rate limit configs.
 *
 * These are PER-IP fairness limits — they stop any single client from
 * monopolizing capacity. The account-wide ceiling that matches OpenRouter's
 * actual free-tier limits is enforced separately (see checkGlobalAiBudget).
 * All AI limits are env-tunable so you can raise them if you add OpenRouter
 * credit (which lifts the free-tier daily cap from 50 to 1000 requests/day).
 */
export const RATE_LIMITS = {
  /** Default AI routes (per IP). */
  ai: { windowMs: 60_000, max: envInt("RATE_LIMIT_AI_RPM", 30), prefix: "ai" },
  /** Luma (Normal Chatbot): fast chat (per IP). */
  luma: { windowMs: 60_000, max: envInt("RATE_LIMIT_LUMA_RPM", 40), prefix: "luma" },
  /** Ouro (Study Buddy): heavier structured outputs (per IP). */
  ouro: { windowMs: 60_000, max: envInt("RATE_LIMIT_OURO_RPM", 24), prefix: "ouro" },
  /** Ankaa (Agent): long-form, expensive (per IP). */
  ankaa: { windowMs: 60_000, max: envInt("RATE_LIMIT_ANKAA_RPM", 10), prefix: "ankaa" },
  /** Upload: uploads per minute per IP. */
  upload: { windowMs: 60_000, max: envInt("RATE_LIMIT_UPLOAD_RPM", 10), prefix: "upload" },
  /** Document read: requests per minute per IP. */
  read: { windowMs: 60_000, max: envInt("RATE_LIMIT_READ_RPM", 120), prefix: "read" },
  /** General API: requests per minute per IP. */
  general: { windowMs: 60_000, max: envInt("RATE_LIMIT_GENERAL_RPM", 240), prefix: "general" },
} as const;

/* ── Account-wide OpenRouter free-tier budget ─────────────────────────────────
 * OpenRouter enforces its free-model limits at the ACCOUNT level (per API key),
 * not per user: roughly 20 requests/minute, and 50 requests/day (or 1000/day
 * once the account has ever held >= $10 of credit).
 *
 * We mirror those ceilings here so the app paces itself right up to — but not
 * past — the free tier, avoiding wasted 429s. Both are env-tunable:
 *   OPENROUTER_FREE_RPM  (default 20)
 *   OPENROUTER_FREE_RPD  (default 1000 — set to 50 if you have NOT added credit)
 */
export const OPENROUTER_FREE_RPM = envInt("OPENROUTER_FREE_RPM", 20);
export const OPENROUTER_FREE_RPD = envInt("OPENROUTER_FREE_RPD", 1000);

const globalRpm: RateLimitEntry = { count: 0, resetAt: 0 };
const globalRpd: RateLimitEntry = { count: 0, resetAt: 0 };

function bump(entry: RateLimitEntry, windowMs: number, max: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  if (entry.resetAt < now) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }
  if (entry.count < max) {
    entry.count++;
    return { ok: true, retryAfterSec: 0 };
  }
  return { ok: false, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
}

export interface GlobalBudgetResult {
  allowed: boolean;
  scope?: "rpm" | "rpd";
  retryAfterSec: number;
}

/**
 * Try to consume one account-wide AI slot. Checks the daily ceiling first
 * (can't be waited out within a request), then the per-minute ceiling.
 * On success, both counters are incremented by one.
 */
export function checkGlobalAiBudget(): GlobalBudgetResult {
  const day = bump(globalRpd, 24 * 60 * 60_000, OPENROUTER_FREE_RPD);
  if (!day.ok) return { allowed: false, scope: "rpd", retryAfterSec: day.retryAfterSec };

  const min = bump(globalRpm, 60_000, OPENROUTER_FREE_RPM);
  if (!min.ok) {
    // Roll back the daily slot we just consumed — this request won't proceed now.
    globalRpd.count = Math.max(0, globalRpd.count - 1);
    return { allowed: false, scope: "rpm", retryAfterSec: min.retryAfterSec };
  }
  return { allowed: true, retryAfterSec: 0 };
}

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
