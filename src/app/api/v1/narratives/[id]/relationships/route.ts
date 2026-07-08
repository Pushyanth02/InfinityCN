/**
 * GET /api/v1/narratives/[id]/relationships
 *
 * Returns the character relationship graph: edges, centralities, and communities.
 */
import { NextRequest } from 'next/server'
import '@/lib/providers'
import { getRelationshipGraph } from '@/lib/services/relationship.service'
import { apiSuccess, apiError } from '@/lib/api/response'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'
import { validate, idSchema } from '@/lib/api/validate'
import { ValidationError } from '@/lib/domain/errors'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const blocked = await securityCheck(req, `rel:${getClientIP(req)}`, 30)
    if (blocked) return blocked

    const { id } = await params
    const idResult = validate(idSchema, id)
    if (!idResult.success) throw new ValidationError('Invalid narrative ID')

    const result = await getRelationshipGraph(idResult.data)
    return apiSuccess(result)
  } catch (err) {
    return apiError(err)
  }
}
