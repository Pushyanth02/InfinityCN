/**
 * POST /api/jobs/[id]/cancel — cancel a QUEUED or PROCESSING job.
 *
 * QUEUED jobs are automically moved to CANCELLED status.
 * PROCESSING jobs are marked CANCELLED — the worker checks job status
 * between pipeline stages and will abort if it sees CANCELLED.
 */
import { NextRequest, NextResponse } from 'next/server'
import { validateIdParam } from '@/lib/middleware/validate-id'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'
import { cancelJob } from '@/lib/services/processing.service'
import { apiError } from '@/lib/api/response'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const blocked = await securityCheck(req, `job-cancel:${getClientIP(req)}`, 10)
  if (blocked) return blocked

  const { id } = await ctx.params
  const invalid = validateIdParam(id, 'jobId')
  if (invalid) return invalid

  try {
    await cancelJob(id)
    return NextResponse.json({ ok: true, jobId: id, message: 'Job cancelled' })
  } catch (err) {
    return apiError(err)
  }
}
