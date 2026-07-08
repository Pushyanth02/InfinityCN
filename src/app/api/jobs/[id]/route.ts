/**
 * GET /api/jobs/[id] — job status (polled by the UI as a WebSocket fallback).
 *
 * Thin wrapper over the job service. The legacy flat `{ job }` response shape is
 * preserved (the frontend reads `data.job.{status,stage,progress,mode,narratives}`).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getJob } from '@/lib/services/job.service'
import { validateIdParam } from '@/lib/middleware/validate-id'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'
import { apiError } from '@/lib/api/response'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const blocked = await securityCheck(_req, `job:${getClientIP(_req)}`, 30)
    if (blocked) return blocked

    const { id } = await ctx.params
    const invalid = validateIdParam(id, 'jobId')
    if (invalid) return invalid

    const job = await getJob(id)
    return NextResponse.json({ job })
  } catch (err) {
    return apiError(err)
  }
}
