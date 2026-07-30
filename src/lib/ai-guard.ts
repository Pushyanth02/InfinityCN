import { NextResponse } from "next/server";
import { checkUserQuota } from "@/lib/quota";

/**
 * Per-user AI quota gate.
 *
 * Centralizes the daily/monthly quota check so every AI route enforces it
 * identically. Returns a ready-to-send 429 response when the user is over
 * their limit, or null when the request may proceed.
 *
 * Pass the session's `setCookie` so the session still persists even on a
 * quota rejection.
 *
 * Usage (after ensureSession + rate limit):
 *   const quotaResp = await aiQuotaGate(userId, setCookie);
 *   if (quotaResp) return quotaResp;
 */
export async function aiQuotaGate(
  userId: string,
  setCookie: Record<string, string> = {},
): Promise<NextResponse | null> {
  const quota = await checkUserQuota(userId);
  if (quota.allowed) return null;
  return NextResponse.json(
    {
      error: `Daily AI limit reached (${quota.dailyUsed}/${quota.dailyLimit}). Try again later.`,
      quota: {
        dailyUsed: quota.dailyUsed,
        dailyLimit: quota.dailyLimit,
        monthlyUsed: quota.monthlyUsed,
        monthlyLimit: quota.monthlyLimit,
      },
    },
    { status: 429, headers: { "Retry-After": String(quota.retryAfterSec), ...setCookie } },
  );
}
