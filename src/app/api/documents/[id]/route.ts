/**
 * GET    /api/documents/[id] — full document detail w/ jobs + narratives
 * DELETE /api/documents/[id] — remove document, its files, and all artifacts
 *
 * Thin wrappers over the document service. The legacy route eagerly loaded the
 * full `rawText` content; no consumer of this endpoint reads it (the processing
 * view only uses `originalName`), so the service's narrower `rawText` select
 * (word/char counts + language) is sufficient and avoids over-fetching.
 *
 * Response shapes are preserved for backward compatibility:
 *   GET    → { document }        (404 { error } on missing)
 *   DELETE → { ok: true }        (404 { error } on missing)
 */
import { NextRequest, NextResponse } from 'next/server'
import { getDocument, deleteDocument } from '@/lib/services/document.service'
import { validateIdParam } from '@/lib/middleware/validate-id'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'
import { isDomainError, getErrorStatusCode } from '@/lib/domain/errors'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const blocked = await securityCheck(_req, `document:${getClientIP(_req)}`, 30)
  if (blocked) return blocked

  const { id } = await ctx.params
  const invalid = validateIdParam(id, 'documentId')
  if (invalid) return invalid

  try {
    const document = await getDocument(id)
    return NextResponse.json({ document })
  } catch (err) {
    // NotFoundError → 404; preserve the legacy flat { error } body.
    if (isDomainError(err) && getErrorStatusCode(err) === 404) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }
    throw err
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const blocked = await securityCheck(_req, `doc-delete:${getClientIP(_req)}`, 10)
  if (blocked) return blocked

  const { id } = await ctx.params
  const invalid = validateIdParam(id, 'documentId')
  if (invalid) return invalid

  try {
    await deleteDocument(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (isDomainError(err) && getErrorStatusCode(err) === 404) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }
    throw err
  }
}
