/**
 * GET /api/stats — dashboard aggregate stats.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'

export async function GET(req: NextRequest) {
  const blocked = securityCheck(req, `stats:${getClientIP(req)}`, 30)
  if (blocked) return blocked

  const [documents, jobs, narratives, scenes, characters, events, peaks] = await Promise.all([
    db.document.count(),
    db.job.count(),
    db.narrative.count(),
    db.scene.count(),
    db.character.count(),
    db.event.count(),
    db.emotionalPeak.count(),
  ])

  const byStatus = await db.document.groupBy({ by: ['status'], _count: true })
  const byJobStatus = await db.job.groupBy({ by: ['status'], _count: true })
  const byMode = await db.narrative.groupBy({ by: ['mode'], _count: true })

  const recentJobs = await db.job.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { document: { select: { originalName: true } }, narratives: { select: { id: true, mode: true, title: true, sceneCount: true } } },
  })

  return NextResponse.json({
    counts: { documents, jobs, narratives, scenes, characters, events, peaks },
    byStatus,
    byJobStatus,
    byMode,
    recentJobs,
  })
}
