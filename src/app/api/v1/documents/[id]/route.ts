/**
 * GET    /api/v1/documents/[id] — Document detail with jobs + narratives
 * DELETE /api/v1/documents/[id] — Delete document and all artifacts
 *
 * Versioned API using the service layer and standard response envelope.
 */
import { NextRequest } from 'next/server'
import '@/lib/providers'
import { getDocument, deleteDocument } from '@/lib/services/document.service'
import { apiSuccess, apiError, apiNoContent } from '@/lib/api/response'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'
import { validateIdParam } from '@/lib/middleware/validate-id'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const blocked = await securityCheck(req, `document:${getClientIP(req)}`, 60)
    if (blocked) return blocked

    const { id } = await ctx.params
    const invalid = validateIdParam(id, 'documentId')
    if (invalid) return invalid

    const doc = await getDocument(id)
    return apiSuccess(doc)
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const blocked = await securityCheck(req, `doc-delete:${getClientIP(req)}`, 10)
    if (blocked) return blocked

    const { id } = await ctx.params
    const invalid = validateIdParam(id, 'documentId')
    if (invalid) return invalid

    await deleteDocument(id)
    return apiNoContent()
  } catch (err) {
    return apiError(err)
  }
}