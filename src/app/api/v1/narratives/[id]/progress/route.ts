/**
 * GET  /api/v1/narratives/[id]/progress — Get reading progress
 * POST /api/v1/narratives/[id]/progress — Upsert reading progress
 *
 * Versioned API using the service layer and standard response envelope.
 */
import { NextRequest } from 'next/server'
import '@/lib/providers'
import { getReadingProgress, upsertReadingProgress } from '@/lib/services/narrative.service'
import { apiSuccess, apiError, apiValidationError } from '@/lib/api/response'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'
import { validateIdParam } from '@/lib/middleware/validate-id'
import { validate, readingProgressSchema } from '@/lib/api/validate'
import { NotFoundError } from '@/lib/domain/errors'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const blocked = await securityCheck(req, `progress:${getClientIP(req)}`, 60)
    if (blocked) return blocked

    const { id } = await ctx.params
    const invalid = validateIdParam(id, 'narrativeId')
    if (invalid) return invalid

    const progress = await getReadingProgress(id)
    if (!progress) throw new NotFoundError(`No reading progress for narrative '${id}'`)
    return apiSuccess(progress)
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const blocked = await securityCheck(req, `progress:${getClientIP(req)}`, 30)
    if (blocked) return blocked

    const { id } = await ctx.params
    const invalid = validateIdParam(id, 'narrativeId')
    if (invalid) return invalid

    const body = await req.json().catch(() => ({}))
    const validation = validate(readingProgressSchema, body)
    if (!validation.success) return apiValidationError(validation.error, validation.details)

    const progress = await upsertReadingProgress(
      id,
      validation.data.scrollPct,
      validation.data.sceneIndex,
      validation.data.paragraphIdx,
    )
    return apiSuccess(progress)
  } catch (err) {
    return apiError(err)
  }
}
