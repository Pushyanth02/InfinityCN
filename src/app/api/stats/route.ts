/**
 * GET /api/stats — dashboard aggregate stats.
 *
 * Thin wrapper over the analytics service. Returns the legacy flat shape
 * ({ counts, byStatus, byJobStatus, byMode, recentJobs }) which the library
 * dashboard reads directly.
 */
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDashboardStats } from '@/lib/services/analytics.service'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'

export async function GET(req: NextRequest) {
  try {
    const blocked = await securityCheck(req, `stats:${getClientIP(req)}`, 30)
    if (blocked) return blocked

    const stats = await getDashboardStats()
    return NextResponse.json(stats)
  } catch {
    return NextResponse.json(
      { error: 'Failed to load stats.' },
      { status: 500 },
    )
  }
}
