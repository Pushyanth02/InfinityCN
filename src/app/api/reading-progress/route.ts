/**
 * GET /api/reading-progress
 * Returns all narratives with reading progress > 5% in a single query.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'

export async function GET(req: NextRequest) {
  const blocked = securityCheck(req, `reading-progress:${getClientIP(req)}`, 30)
  if (blocked) return blocked

  const progressRecords = await db.readingProgress.findMany({
    where: { scrollPct: { gt: 5, lt: 100 } },
    include: {
      narrative: {
        select: { id: true, title: true, mode: true, wordCount: true, readingTimeMin: true, sceneCount: true, document: { select: { id: true, originalName: true, fileHash: true } } },
      },
    },
    orderBy: { scrollPct: 'desc' },
    take: 6,
  })

  const results = progressRecords.filter((p) => p.narrative).map((p) => ({
    narrativeId: p.narrative.id, docId: p.narrative.document.id, title: p.narrative.title,
    originalName: p.narrative.document.originalName, fileHash: p.narrative.document.fileHash,
    scrollPct: p.scrollPct, sceneIndex: p.sceneIndex, mode: p.narrative.mode,
  }))
  return NextResponse.json({ items: results })
}
