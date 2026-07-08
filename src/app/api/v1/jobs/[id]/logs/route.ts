/**
 * GET /api/v1/jobs/[id]/logs — Processing log stream (paginated)
 */
import { NextRequest } from 'next/server'
import '@/lib/providers'
import { getJobLogs } from '@/lib/services/job.service'
import { apiPaginated, apiError } from '@/lib/api/response'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'
import { validateIdParam } from '@/lib/middleware/validate-id'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const blocked = await securityCheck(req, `job-logs:${getClientIP(req)}`, 60)
    if (blocked) return blocked
    const { id } = await ctx.params
    const invalid = validateIdParam(id, 'jobId')
    if (invalid) return invalid
    const limit = Math.min(500, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '50', 10) || 50))
    const offset = Math.max(0, parseInt(req.nextUrl.searchParams.get('offset') || '0', 10) || 0)
    const level = req.nextUrl.searchParams.get('level') || undefined
    const { logs, total } = await getJobLogs(id, { limit, offset, level })
    return apiPaginated(logs, { limit, offset, total, hasMore: offset + limit < total })
  } catch (err) { return apiError(err) }
}
