/**
 * GET  /api/jobs/dead-letter — list jobs in DEAD_LETTER state
 * POST /api/jobs/dead-letter — retry a dead-letter job (body: { jobId })
 *
 * Spec reference: Reliability fix 2.18
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'
import { validateIdParam } from '@/lib/middleware/validate-id'
import { enforceBodySize } from '@/lib/middleware/body-size'

export async function GET(req: NextRequest) {
  const blocked = securityCheck(req, `dead-letter:${getClientIP(req)}`, 20)
  if (blocked) return blocked

  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '20', 10) || 20))
  const offset = Math.max(0, parseInt(req.nextUrl.searchParams.get('offset') || '0', 10) || 0)

  const [jobs, total] = await Promise.all([
    db.job.findMany({
      where: { status: 'DEAD_LETTER' },
      orderBy: { completedAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        document: { select: { id: true, originalName: true } },
      },
    }),
    db.job.count({ where: { status: 'DEAD_LETTER' } }),
  ])

  return NextResponse.json({
    jobs,
    pagination: { total, limit, offset },
  })
}

export async function POST(req: NextRequest) {
  const blocked = securityCheck(req, `dead-letter-retry:${getClientIP(req)}`, 10)
  if (blocked) return blocked
  const tooLarge = enforceBodySize(req)
  if (tooLarge) return tooLarge

  const body = await req.json()
  const { jobId } = body

  if (!jobId) {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
  }

  const invalid = validateIdParam(jobId, 'jobId')
  if (invalid) return invalid

  // Atomically move from DEAD_LETTER back to QUEUED
  const result = await db.job.updateMany({
    where: { id: jobId, status: 'DEAD_LETTER' },
    data: {
      status: 'QUEUED',
      stage: 'QUEUED',
      progress: 0,
      error: null,
      startedAt: null,
      completedAt: null,
    },
  })

  if (result.count === 0) {
    return NextResponse.json(
      { error: 'Job not found or not in DEAD_LETTER state' },
      { status: 404 },
    )
  }

  return NextResponse.json({ ok: true, jobId, message: 'Job re-queued for processing' })
}
