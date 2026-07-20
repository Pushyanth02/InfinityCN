/**
 * GET  /api/v1/documents — List documents (paginated, filtered, sorted)
 * POST /api/v1/documents — Upload a document (multipart form-data)
 *
 * Versioned API using the service layer and standard response envelope.
 */
import { NextRequest } from 'next/server'
import '@/lib/providers'
import { uploadDocument, listDocuments } from '@/lib/services/document.service'
import { apiSuccess, apiPaginated, apiError, apiValidationError } from '@/lib/api/response'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'
import { validate, documentListQuerySchema, uploadFormSchema } from '@/lib/api/validate'
import { ValidationError } from '@/lib/domain/errors'
import { dispatchProcessing } from '@/lib/pipeline/dispatch'

// ─── GET: List documents ──────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const blocked = await securityCheck(req, `documents:${getClientIP(req)}`, 60)
    if (blocked) return blocked

    const status = req.nextUrl.searchParams.get('status') || undefined
    const limit = Math.min(200, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '50', 10) || 50))
    const offset = Math.max(0, parseInt(req.nextUrl.searchParams.get('offset') || '0', 10) || 0)
    const sortBy = req.nextUrl.searchParams.get('sortBy') || 'createdAt'
    const sortOrder = req.nextUrl.searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc'

    const validation = validate(documentListQuerySchema, { status, limit, offset, sortBy, sortOrder })
    if (!validation.success) return apiValidationError(validation.error, validation.details)

    const { documents, total } = await listDocuments(validation.data)

    return apiPaginated(documents, {
      limit: validation.data.limit,
      offset: validation.data.offset,
      total,
      hasMore: validation.data.offset + validation.data.limit < total,
    })
  } catch (err) {
    return apiError(err)
  }
}

// ─── POST: Upload a document ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const blocked = await securityCheck(req, `upload:${getClientIP(req)}`, 5)
    if (blocked) return blocked

    const formData = await req.formData()
    const file = formData.get('file')
    const mode = (formData.get('mode') as string) || 'BOTH'
    const priority = parseInt(String(formData.get('priority') ?? '5'), 10) || 5

    const modeValidation = validate(uploadFormSchema, { mode, priority })
    if (!modeValidation.success) {
      return apiValidationError(modeValidation.error, modeValidation.details)
    }

    if (!file || !(file instanceof File)) {
      throw new ValidationError('No file uploaded.')
    }

    const buf = Buffer.from(await file.arrayBuffer())

    const result = await uploadDocument({
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      fileBuffer: buf,
      fileSize: file.size,
      mode: modeValidation.data.mode,
      priority: modeValidation.data.priority,
    })

    // Kick off processing (serverless: after() post-response; self-hosted: no-op).
    void dispatchProcessing(result.jobId)

    return apiSuccess(result, 201)
  } catch (err) {
    return apiError(err)
  }
}