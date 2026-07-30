import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/ai/usage — usage monitoring stats across all AI bots.
 * Returns per-bot request counts, token estimates, error rates, and recent
 * activity. Powers the usage widget on the dashboard/settings.
 */
export async function GET() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h

  const rows = await db.usageEvent.findMany({
    where: { createdAt: { gte: since } },
    select: { bot: true, kind: true, tokensEstimate: true, latencyMs: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  // Aggregate per bot.
  const byBot: Record<string, { count: number; tokens: number; errors: number; avgLatencyMs: number }> = {};
  for (const r of rows) {
    const b = byBot[r.bot] ?? { count: 0, tokens: 0, errors: 0, avgLatencyMs: 0 };
    b.count++;
    b.tokens += r.tokensEstimate;
    if (r.status === "error") b.errors++;
    b.avgLatencyMs += r.latencyMs;
    byBot[r.bot] = b;
  }
  for (const b of Object.values(byBot)) {
    b.avgLatencyMs = b.count > 0 ? Math.round(b.avgLatencyMs / b.count) : 0;
  }

  const total = rows.length;
  const totalTokens = rows.reduce((a, r) => a + r.tokensEstimate, 0);
  const totalErrors = rows.filter((r) => r.status === "error").length;

  return NextResponse.json({
    window: "24h",
    total,
    totalTokens,
    totalErrors,
    byBot,
    recent: rows.slice(0, 12).map((r) => ({
      bot: r.bot,
      kind: r.kind,
      tokens: r.tokensEstimate,
      latencyMs: r.latencyMs,
      status: r.status,
      at: r.createdAt.toISOString(),
    })),
  });
}
