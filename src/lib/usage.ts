import { db } from "@/lib/db";

/**
 * AI usage tracking primitives.
 *
 * Extracted into their own module (with no dependency on the AI client) so
 * both `ai-helpers.ts` and `ai-client.ts` can record usage without creating
 * a circular import. Every AI request should write exactly one UsageEvent so
 * per-user quotas (see checkUserQuota) are accurate.
 */

/** Rough token estimate (~4 chars per token). Used for usage monitoring. */
export function estimateTokens(...parts: string[]): number {
  const total = parts.reduce((a, p) => a + p.length, 0);
  return Math.ceil(total / 4);
}

/** Fire-and-forget usage tracker. Writes a UsageEvent row for monitoring. */
export async function trackUsage(p: {
  bot: string;
  kind: string;
  documentId?: string;
  userId?: string;
  tokensEstimate: number;
  latencyMs: number;
  status: string;
}): Promise<void> {
  await db.usageEvent.create({
    data: {
      bot: p.bot,
      kind: p.kind,
      documentId: p.documentId ?? null,
      userId: p.userId ?? null,
      tokensEstimate: p.tokensEstimate,
      latencyMs: p.latencyMs,
      status: p.status,
    },
  });
}
