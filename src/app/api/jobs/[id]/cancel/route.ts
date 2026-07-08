/**
 * POST /api/jobs/[id]/cancel — cancel a QUEUED or PROCESSING job.
 *
 * QUEUED jobs are automically moved to CANCELLED status.
 * PROCESSING jobs are marked CANCELLED — the worker checks job status
 * between pipeline stages and will abort if it sees CANCELLED.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateIdParam } from '@/lib/middleware/validate-id'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const blocked = await securityCheck(req, `job-cancel:${getClientIP(req)}`, 10)
  if (blocked) return blocked

  const { id } = await ctx.params
  const invalid = validateIdParam(id, 'jobId')
  if (invalid) return invalid

  // Atomically cancel only if the job is in a cancellable state
  const result = await db.job.updateMany({
    where: {
      id,
      status: { in: ['QUEUED', 'PROCESSING'] },
    },
    data: {
      status: 'CANCELLED',
      stage: 'CANCELLED',
      error: 'Cancelled by user',
      completedAt: new Date(),
    },
  })

  if (result.count === 0) {
    return NextResponse.json(
      { error: 'Job not found or not in a cancellable state' },
      { status: 404 },
    )
  }

  return NextResponse.json({ ok: true, jobId: id, message: 'Job cancelled' })
}