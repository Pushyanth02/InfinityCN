/**
 * GET /api/v1/narratives/[id]/search?q=query
 */
import { NextRequest } from 'next/server'
import '@/lib/providers'
import { searchNarrative } from '@/lib/services/search.service'
import { apiSuccess, apiError } from '@/lib/api/response'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'
import { validateIdParam } from '@/lib/middleware/validate-id'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const blocked = await securityCheck(req, `search:${getClientIP(req)}`, 30)
    if (blocked) return blocked
    const { id } = await ctx.params
    const invalid = validateIdParam(id, 'narrativeId')
    if (invalid) return invalid
    const q = req.nextUrl.searchParams.get('q')?.trim() || ''
    const type = (req.nextUrl.searchParams.get('type') || undefined) as 'paragraph' | 'scene' | 'character' | 'event' | undefined
    const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '50', 10) || 50))
    const offset = Math.max(0, parseInt(req.nextUrl.searchParams.get('offset') || '0', 10) || 0)
    const results = await searchNarrative({ narrativeId: id, query: q, type, limit, offset })
    return apiSuccess(results)
  } catch (err) { return apiError(err) }
}
