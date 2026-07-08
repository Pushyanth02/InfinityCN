/**
 * GET /api/v1/stats — Dashboard aggregates
 *
 * Versioned API using the service layer and standard response envelope.
 */
import { NextRequest } from 'next/server'
import '@/lib/providers'
import { getDashboardStats } from '@/lib/services/analytics.service'
import { apiSuccess, apiError } from '@/lib/api/response'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'

export async function GET(req: NextRequest) {
  try {
    const blocked = await securityCheck(req, `stats:${getClientIP(req)}`, 30)
    if (blocked) return blocked

    const stats = await getDashboardStats()
    return apiSuccess(stats)
  } catch (err) {
    return apiError(err)
  }
}
