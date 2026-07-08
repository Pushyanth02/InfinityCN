/**
 * GET /api/narratives/[id]/export?format=markdown|pdf|epub
 *
 * Thin wrapper over the export service. Consumers (the reader view) offer
 * markdown / pdf / epub; the legacy route treats `md` as an alias for
 * `markdown`, returns 400 for any other format, and 404 when the narrative is
 * missing — preserving the exact contract the UI depends on.
 *
 * All generation is delegated to `exportNarrative` in the service layer so the
 * unversioned and versioned export routes share one implementation.
 */

import { NextRequest, NextResponse } from 'next/server'
import { exportNarrative, type ExportFormat } from '@/lib/services/export.service'
import { sendExport } from '@/lib/api/response'
import { isDomainError, getErrorStatusCode } from '@/lib/domain/errors'
import { validateIdParam } from '@/lib/middleware/validate-id'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'

// Legacy surface: the reader offers markdown|pdf|epub, plus the `md` alias.
const LEGACY_FORMATS: Record<string, ExportFormat> = {
  markdown: 'markdown',
  md: 'markdown',
  pdf: 'pdf',
  epub: 'epub',
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const blocked = await securityCheck(req, `export:${getClientIP(req)}`, 10)
  if (blocked) return blocked

  const { id } = await ctx.params
  const invalid = validateIdParam(id, 'narrativeId')
  if (invalid) return invalid

  const rawFormat = req.nextUrl.searchParams.get('format') || 'markdown'
  const format = LEGACY_FORMATS[rawFormat]
  if (!format) {
    return NextResponse.json({ error: 'Unsupported export format' }, { status: 400 })
  }

  try {
    const result = await exportNarrative(id, format)
    return sendExport(result)
  } catch (err) {
    if (isDomainError(err) && getErrorStatusCode(err) === 404) {
      return NextResponse.json({ error: 'Narrative not found' }, { status: 404 })
    }
    throw err
  }
}
