import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ensureSession } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/stats — library + activity stats for the CURRENT user only.
export async function GET(req: NextRequest) {
  const { userId, setCookie } = ensureSession(req);

  // Use aggregate queries instead of fetching all documents — much faster
  // and avoids loading contentJson (which can be megabytes per doc). Every
  // query is scoped to the caller so stats never leak across users.
  const total = await db.document.count({ where: { userId } });
  const ready = await db.document.count({ where: { userId, status: "ready" } });
  const processing = await db.document.count({ where: { userId, status: "processing" } });
  const error = await db.document.count({ where: { userId, status: "error" } });
  const favorites = await db.document.count({ where: { userId, favorite: true } });
  const inProgress = await db.document.count({
    where: { userId, readingProgress: { gt: 0, lt: 1 } },
  });
  const finished = await db.document.count({ where: { userId, readingProgress: { gte: 1 } } });

  // Aggregate sums for words and bytes
  const agg = await db.document.aggregate({
    where: { userId },
    _sum: { wordCount: true, byteSize: true, readingProgress: true },
  });
  const totalWords = agg._sum.wordCount ?? 0;
  const totalBytes = agg._sum.byteSize ?? 0;
  const avgProgress = total > 0 ? (agg._sum.readingProgress ?? 0) / total : 0;

  // By source type — use groupBy instead of loading all docs
  const bySourceRaw = await db.document.groupBy({
    by: ["sourceType"],
    where: { userId },
    _count: true,
  });
  const bySource: Record<string, number> = {};
  for (const g of bySourceRaw) bySource[g.sourceType] = g._count;

  // Recent 7-day activity histogram (this user's activity only)
  const since = new Date(Date.now() - 7 * 86400_000);
  const recentCount = await db.activityEvent.count({ where: { userId, createdAt: { gte: since } } });

  // Build histogram with individual count queries per day (7 queries, each fast)
  const histogram: { day: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(Date.now() - i * 86400_000);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86400_000);
    const count = await db.activityEvent.count({
      where: { userId, createdAt: { gte: dayStart, lt: dayEnd } },
    });
    histogram.push({ day: dayStart.toISOString().slice(0, 10), count });
  }

  return NextResponse.json({
    total,
    ready,
    processing,
    error,
    favorites,
    totalWords,
    totalBytes,
    inProgress,
    finished,
    avgProgress,
    bySource,
    histogram,
    activityTotal: recentCount,
  }, { headers: setCookie });
}
