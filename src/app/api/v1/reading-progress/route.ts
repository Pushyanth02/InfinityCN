/**
 * GET /api/v1/reading-progress — All narratives with active reading progress
 *
 * Versioned API using the service layer and standard response envelope. The
 * projected `items` shape matches the legacy /api/reading-progress route so the
 * two surfaces are equivalent; only the envelope differs (apiSuccess wraps it).
 */
import { NextRequest } from 'next/server'
import '@/lib/providers'
import { getReadingList } from '@/lib/services/narrative.service'
import { apiSuccess, apiError } from '@/lib/api/response'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'

export async function GET(req: NextRequest) {
  try {
    const blocked = await securityCheck(req, `reading-progress:${getClientIP(req)}`, 30)
    if (blocked) return blocked

    // getReadingList already projects to the flat { items } shape used by the
    // legacy route — the two surfaces are equivalent.
    const items = await getReadingList()
    return apiSuccess({ items })
  } catch (err) {
    return apiError(err)
  }
}
