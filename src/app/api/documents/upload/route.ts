/**
 * POST /api/documents/upload
 * Accepts PDF/DOCX/TXT, stores it, hashes it (dedup), creates Document + Job.
 *
 * Thin wrapper over document.service.uploadDocument — all validation (size,
 * MIME, extension, magic bytes, filename sanitization, hash dedup, job dedup)
 * lives in the service layer. This route preserves the legacy flat response
 * contract { documentId, jobId, mode, status, message, deduplicated? } that
 * the frontend consumes directly (the /api/v1 surface uses an enveloped shape).
 */
import { NextRequest, NextResponse } from 'next/server'
import '@/lib/providers'
import { uploadDocument } from '@/lib/services/document.service'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'
import { getErrorStatusCode } from '@/lib/domain/errors'
import { createLogger } from '@/lib/logger'

const logger = createLogger('upload')

export async function POST(req: NextRequest) {
  try {
    const blocked = await securityCheck(req, `upload:${getClientIP(req)}`, 5)
    if (blocked) return blocked

    const formData = await req.formData()
    const file = formData.get('file')
    const mode = (formData.get('mode') as string) || 'BOTH'
    const priority = Math.max(1, Math.min(10, parseInt(String(formData.get('priority') ?? '5'), 10) || 5))

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 })
    }

    const buf = Buffer.from(await file.arrayBuffer())

    // The service owns all validation/storage/dedup and returns the exact flat
    // contract the frontend expects. We surface its typed errors with their
    // correct HTTP status (413/415/400) rather than a generic 500.
    const result = await uploadDocument({
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      fileBuffer: buf,
      fileSize: file.size,
      mode: mode as 'ORIGINAL' | 'CINEMATIFIED' | 'BOTH',
      priority,
    })

    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    logger.error('Upload failed', { error: (err as Error).message })
    // Domain errors (PayloadTooLarge, UnsupportedMediaType, Validation) carry
    // their own status; unknown errors degrade to 500 with a safe message.
    const status = getErrorStatusCode(err)
    const message =
      status < 500 && err instanceof Error ? err.message : 'Upload failed. Please try again.'
    return NextResponse.json({ error: message }, { status })
  }
}
