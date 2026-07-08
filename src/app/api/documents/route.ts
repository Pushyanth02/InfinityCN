/**
 * GET /api/documents — list all uploaded documents (most recent first).
 * Optional ?status= filter.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'

export async function GET(req: NextRequest) {
  const blocked = securityCheck(req, `documents:${getClientIP(req)}`, 30)
  if (blocked) return blocked

  const status = req.nextUrl.searchParams.get('status')
  const docs = await db.document.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { jobs: true, narratives: true } },
      jobs: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    take: 100,
  })
  return NextResponse.json({ documents: docs })
}
