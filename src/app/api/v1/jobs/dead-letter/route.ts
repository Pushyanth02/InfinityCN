/**
 * GET  /api/v1/jobs/dead-letter — List dead-letter jobs
 * POST /api/v1/jobs/dead-letter — Retry a dead-letter job
 */
import { NextRequest } from 'next/server'
import '@/lib/providers'
import { listDeadLetterJobs, retryDeadLetterJob } from '@/lib/services/job.service'
import { apiSuccess, apiPaginated, apiError } from '@/lib/api/response'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'
import { ValidationError } from '@/lib/domain/errors'

export async function GET(req: NextRequest) {
  try {
    const blocked = await securityCheck(req, `dead-letter:${getClientIP(req)}`, 30)
    if (blocked) return blocked
    const limit = Math.min(200, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '50', 10) || 50))
    const offset = Math.max(0, parseInt(req.nextUrl.searchParams.get('offset') || '0', 10) || 0)
    const { jobs, total } = await listDeadLetterJobs({ limit, offset })
    return apiPaginated(jobs, { limit, offset, total, hasMore: offset + limit < total })
  } catch (err) { return apiError(err) }
}

export async function POST(req: NextRequest) {
  try {
    const blocked = await securityCheck(req, `dead-letter-retry:${getClientIP(req)}`, 5)
    if (blocked) return blocked
    const body = await req.json().catch(() => ({}))
    const jobId = typeof body.jobId === 'string' ? body.jobId : ''
    if (!jobId) throw new ValidationError('jobId is required')
    const result = await retryDeadLetterJob(jobId)
    return apiSuccess(result)
  } catch (err) { return apiError(err) }
}
