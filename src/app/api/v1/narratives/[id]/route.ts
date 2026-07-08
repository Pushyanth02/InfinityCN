/**
 * GET /api/v1/narratives/[id] — Full narrative with all analysis artifacts
 */
import { NextRequest } from 'next/server'
import '@/lib/providers'
import { getNarrative } from '@/lib/services/narrative.service'
import { apiSuccess, apiError } from '@/lib/api/response'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'
import { validateIdParam } from '@/lib/middleware/validate-id'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const blocked = await securityCheck(req, `narrative:${getClientIP(req)}`, 60)
    if (blocked) return blocked
    const { id } = await ctx.params
    const invalid = validateIdParam(id, 'narrativeId')
    if (invalid) return invalid
    const view = (req.nextUrl.searchParams.get('view') || 'all') as 'all' | 'summary'
    const paraLimit = Math.min(200, Math.max(1, parseInt(req.nextUrl.searchParams.get('paraLimit') || '50', 10) || 50))
    const paraOffset = Math.max(0, parseInt(req.nextUrl.searchParams.get('paraOffset') || '0', 10) || 0)
    const sceneLimit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get('sceneLimit') || '50', 10) || 50))
    const sceneOffset = Math.max(0, parseInt(req.nextUrl.searchParams.get('sceneOffset') || '0', 10) || 0)
    const result = await getNarrative(id, { view, paraLimit, paraOffset, sceneLimit, sceneOffset })
    return apiSuccess(result)
  } catch (err) { return apiError(err) }
}
