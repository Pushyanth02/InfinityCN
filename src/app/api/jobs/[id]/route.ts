/**
 * GET /api/jobs/[id] — job status (polled by the UI as a WebSocket fallback).
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateIdParam } from '@/lib/middleware/validate-id'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const blocked = securityCheck(_req, `job:${getClientIP(_req)}`, 30)
  if (blocked) return blocked

  const { id } = await ctx.params
  const invalid = validateIdParam(id, 'jobId')
  if (invalid) return invalid
  const job = await db.job.findUnique({
    where: { id },
    include: { document: true, narratives: { select: { id: true, mode: true, title: true, sceneCount: true } } },
  })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  return NextResponse.json({ job })
}
