import { db } from "@/lib/db";

/**
 * Per-user AI quota enforcement.
 *
 * Prevents a single user from draining the AI budget by enforcing daily
 * and monthly limits on AI requests. Counts are based on UsageEvent rows.
 */

/** Positive-integer env override helper. */
function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

/**
 * Per-user limits. These are generous by default — the shared OpenRouter
 * free-tier ceiling is enforced separately (checkGlobalAiBudget), so per-user
 * caps exist mainly for fairness between anonymous sessions. Tune via env:
 *   USER_DAILY_AI_LIMIT   (default 300)
 *   USER_MONTHLY_AI_LIMIT (default 6000)
 */
export const DAILY_AI_LIMIT = envInt("USER_DAILY_AI_LIMIT", 300);

/** Monthly limit: AI requests per user per 30 days. */
export const MONTHLY_AI_LIMIT = envInt("USER_MONTHLY_AI_LIMIT", 6000);

export interface QuotaResult {
  allowed: boolean;
  dailyUsed: number;
  dailyLimit: number;
  monthlyUsed: number;
  monthlyLimit: number;
  retryAfterSec: number;
}

/**
 * Check if the user has remaining AI quota.
 * Returns { allowed: true } if under both limits, or { allowed: false }
 * with retry-after info if a limit is exceeded.
 */
export async function checkUserQuota(userId: string): Promise<QuotaResult> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [dailyCount, monthlyCount] = await Promise.all([
    db.usageEvent.count({
      where: {
        userId,
        status: "ok",
        createdAt: { gte: dayAgo },
      },
    }),
    db.usageEvent.count({
      where: {
        userId,
        status: "ok",
        createdAt: { gte: monthAgo },
      },
    }),
  ]);

  if (monthlyCount >= MONTHLY_AI_LIMIT) {
    return {
      allowed: false,
      dailyUsed: dailyCount,
      dailyLimit: DAILY_AI_LIMIT,
      monthlyUsed: monthlyCount,
      monthlyLimit: MONTHLY_AI_LIMIT,
      retryAfterSec: Math.ceil((monthAgo.getTime() + 30 * 86400000 - now.getTime()) / 1000),
    };
  }

  if (dailyCount >= DAILY_AI_LIMIT) {
    return {
      allowed: false,
      dailyUsed: dailyCount,
      dailyLimit: DAILY_AI_LIMIT,
      monthlyUsed: monthlyCount,
      monthlyLimit: MONTHLY_AI_LIMIT,
      retryAfterSec: Math.ceil((dayAgo.getTime() + 86400000 - now.getTime()) / 1000),
    };
  }

  return {
    allowed: true,
    dailyUsed: dailyCount,
    dailyLimit: DAILY_AI_LIMIT,
    monthlyUsed: monthlyCount,
    monthlyLimit: MONTHLY_AI_LIMIT,
    retryAfterSec: 0,
  };
}

/**
 * Verify that a document belongs to the given user.
 * Returns the document if owned, null otherwise.
 * This is the core isolation check — every AI route must call this before
 * processing a documentId.
 */
export async function verifyDocumentOwnership(
  documentId: string,
  userId: string,
) {
  return db.document.findFirst({
    where: { id: documentId, userId },
  });
}
