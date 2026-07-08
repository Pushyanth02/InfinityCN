/**
 * GET  /api/jobs/dead-letter — list jobs in DEAD_LETTER state
 * POST /api/jobs/dead-letter — retry a dead-letter job (body: { jobId })
 *
 * Thin wrapper over the job service. No frontend caller — this is an
 * admin/external endpoint (the UI does not surface dead-letter management).
 *
 * Spec reference: Reliability fix 2.18
 */
import { NextRequest, NextResponse } from 'next/server'
import { listDeadLetterJobs, retryDeadLetterJob } from '@/lib/services/job.service'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'
import { validateIdParam } from '@/lib/middleware/validate-id'
import { enforceBodySize } from '@/lib/middleware/body-size'

export async function GET(req: NextRequest) {
  const blocked = await securityCheck(req, `dead-letter:${getClientIP(req)}`, 20)
  if (blocked) return blocked

  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '20', 10) || 20))
  const offset = Math.max(0, parseInt(req.nextUrl.searchParams.get('offset') || '0', 10) || 0)

  const { jobs, total } = await listDeadLetterJobs({ limit, offset })

  return NextResponse.json({
    jobs,
    pagination: { total, limit, offset },
  })
}

export async function POST(req: NextRequest) {
  const blocked = await securityCheck(req, `dead-letter-retry:${getClientIP(req)}`, 10)
  if (blocked) return blocked
  const tooLarge = enforceBodySize(req)
  if (tooLarge) return tooLarge

  let body: { jobId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { jobId } = body

  if (!jobId || typeof jobId !== 'string') {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
  }

  const invalid = validateIdParam(jobId, 'jobId')
  if (invalid) return invalid

  try {
    const result = await retryDeadLetterJob(jobId)
    return NextResponse.json({ ok: true, jobId: result.jobId, message: result.message })
  } catch (err) {
    // retryDeadLetterJob throws NotFoundError when the job isn't in DEAD_LETTER.
    const status = (err as { statusCode?: number })?.statusCode ?? 500
    const message = err instanceof Error ? err.message : 'Job not found or not in DEAD_LETTER state'
    return NextResponse.json({ error: message }, { status })
  }
}
