/**
 * GET /api/v1/documents/[id]/narratives — List narratives for a document
 */
import { NextRequest } from 'next/server'
import '@/lib/providers'
import { listNarrativesForDocument } from '@/lib/services/narrative.service'
import { apiSuccess, apiError } from '@/lib/api/response'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'
import { validateIdParam } from '@/lib/middleware/validate-id'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const blocked = await securityCheck(req, `doc-narratives:${getClientIP(req)}`, 60)
    if (blocked) return blocked
    const { id } = await ctx.params
    const invalid = validateIdParam(id, 'documentId')
    if (invalid) return invalid
    const narratives = await listNarrativesForDocument(id)
    return apiSuccess(narratives)
  } catch (err) { return apiError(err) }
}
