/**
 * GET /api/v1/jobs/[id] — Job status
 */
import { NextRequest } from 'next/server'
import '@/lib/providers'
import { getJob } from '@/lib/services/job.service'
import { apiSuccess, apiError } from '@/lib/api/response'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'
import { validateIdParam } from '@/lib/middleware/validate-id'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const blocked = await securityCheck(req, `job:${getClientIP(req)}`, 60)
    if (blocked) return blocked
    const { id } = await ctx.params
    const invalid = validateIdParam(id, 'jobId')
    if (invalid) return invalid
    const job = await getJob(id)
    return apiSuccess(job)
  } catch (err) { return apiError(err) }
}
