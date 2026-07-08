/**
 * GET /api/v1/reading-progress — All narratives with active reading progress
 *
 * Versioned API using the service layer and standard response envelope.
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

    const readingList = await getReadingList()
    return apiSuccess(readingList)
  } catch (err) {
    return apiError(err)
  }
}
