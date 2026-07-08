/**
 * GET /api/jobs/[id]/logs — processing logs for a job.
 *
 * Thin wrapper over the job service. Note: the UI streams logs live over
 * WebSocket (useRealtime), so this HTTP endpoint is primarily for external /
 * programmatic consumers. Returns `{ logs, total }` (additive over the legacy
 * `{ logs }` shape — `logs` is unchanged).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getJobLogs } from '@/lib/services/job.service'
import { validateIdParam } from '@/lib/middleware/validate-id'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const blocked = await securityCheck(req, `job-logs:${getClientIP(req)}`, 30)
  if (blocked) return blocked

  const { id } = await ctx.params
  const invalid = validateIdParam(id, 'jobId')
  if (invalid) return invalid

  const limit = Math.min(500, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '500', 10) || 500))
  const { logs, total } = await getJobLogs(id, { limit })
  return NextResponse.json({ logs, total })
}
