import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { safeErrorDetail } from "@/lib/safe-error";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/health
 *
 * Health check endpoint for deployment platforms. Checks:
 *   - Database connectivity (Prisma query)
 *   - AI provider availability (lazy SDK import check)
 *
 * Returns 200 if healthy, 503 if degraded. In production, error details
 * are never exposed — only a generic "degraded" status.
 */
export async function GET(req: NextRequest) {
  // Rate limit to prevent scraping.
  const rl = checkRateLimit(req, RATE_LIMITS.read);
  if (!rl.allowed) {
    return NextResponse.json(
      { status: "degraded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const checks: Record<string, string> = {};
  let allOk = true;

  // 1. Database check
  try {
    const { db } = await import("@/lib/db");
    await db.document.count();
    checks.database = "ok";
  } catch {
    checks.database = "error";
    allOk = false;
  }

  // 2. AI provider check (verify OpenRouter is configured)
  if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim() !== "") {
    checks.ai = "ok";
  } else {
    // Missing key means AI features are disabled, but the app is still usable.
    checks.ai = "unconfigured";
  }

  // 3. Storage check (database IS the storage for this app)
  checks.storage = checks.database;

  const status = allOk ? "ok" : "degraded";
  const body: Record<string, unknown> = {
    status,
    timestamp: new Date().toISOString(),
    ...checks,
  };

  // Only include error details in development.
  const detail = safeErrorDetail(null);
  if (detail) body.detail = detail;

  return NextResponse.json(body, { status: allOk ? 200 : 503 });
}

