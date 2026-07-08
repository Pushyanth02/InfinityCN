/**
 * GET /api/jobs/[id]/logs — processing logs for a job.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateIdParam } from '@/lib/middleware/validate-id'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const invalid = validateIdParam(id, 'jobId')
  if (invalid) return invalid
  const logs = await db.processingLog.findMany({
    where: { jobId: id },
    orderBy: { timestamp: 'asc' },
    take: 500,
  })
  return NextResponse.json({ logs })
}
