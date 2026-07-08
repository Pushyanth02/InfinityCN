/**
 * GET   /api/v1/narratives/[id]/bookmarks — List bookmarks
 * POST  /api/v1/narratives/[id]/bookmarks — Create a bookmark
 * DELETE /api/v1/narratives/[id]/bookmarks?bookmarkId=... — Delete a bookmark
 *
 * Versioned API using the service layer and standard response envelope.
 */
import { NextRequest } from 'next/server'
import '@/lib/providers'
import { listBookmarks, createBookmark, deleteBookmark } from '@/lib/services/narrative.service'
import { apiSuccess, apiError, apiValidationError, apiNoContent } from '@/lib/api/response'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'
import { validateIdParam } from '@/lib/middleware/validate-id'
import { validate, createBookmarkSchema } from '@/lib/api/validate'
import { ValidationError } from '@/lib/domain/errors'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const blocked = await securityCheck(req, `bookmarks:${getClientIP(req)}`, 60)
    if (blocked) return blocked

    const { id } = await ctx.params
    const invalid = validateIdParam(id, 'narrativeId')
    if (invalid) return invalid

    const bookmarks = await listBookmarks(id)
    return apiSuccess(bookmarks)
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const blocked = await securityCheck(req, `bookmarks:${getClientIP(req)}`, 30)
    if (blocked) return blocked

    const { id } = await ctx.params
    const invalid = validateIdParam(id, 'narrativeId')
    if (invalid) return invalid

    const body = await req.json().catch(() => ({}))
    const validation = validate(createBookmarkSchema, body)
    if (!validation.success) return apiValidationError(validation.error, validation.details)

    const bookmark = await createBookmark(
      id,
      validation.data.offset,
      validation.data.sceneIndex,
      validation.data.paragraphIdx,
      validation.data.label,
      validation.data.note,
    )
    return apiSuccess(bookmark, 201)
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const blocked = await securityCheck(req, `bookmarks:${getClientIP(req)}`, 30)
    if (blocked) return blocked

    const { id } = await ctx.params
    const invalid = validateIdParam(id, 'narrativeId')
    if (invalid) return invalid

    const bookmarkId = req.nextUrl.searchParams.get('bookmarkId')
    if (!bookmarkId) throw new ValidationError('bookmarkId query parameter is required')

    await deleteBookmark(id, bookmarkId)
    return apiNoContent()
  } catch (err) {
    return apiError(err)
  }
}
