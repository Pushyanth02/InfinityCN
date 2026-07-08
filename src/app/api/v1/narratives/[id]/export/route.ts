/**
 * GET /api/v1/narratives/[id]/export?format=markdown|html|epub|json|pdf
 *
 * Thin wrapper over the export service. The versioned surface accepts the full
 * format set (including html/json); the unversioned surface is narrower.
 */
import { NextRequest } from 'next/server'
import '@/lib/providers'
import { exportNarrative } from '@/lib/services/export.service'
import { sendExport, apiError } from '@/lib/api/response'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'
import { validate, idSchema, exportFormatSchema } from '@/lib/api/validate'
import { ValidationError } from '@/lib/domain/errors'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const blocked = await securityCheck(req, `export:${getClientIP(req)}`, 10)
    if (blocked) return blocked

    const { id } = await params
    const idResult = validate(idSchema, id)
    if (!idResult.success) throw new ValidationError('Invalid narrative ID')

    const { searchParams } = new URL(req.url)
    const format = searchParams.get('format') || 'markdown'
    const fmtResult = validate(exportFormatSchema, format)
    if (!fmtResult.success) throw new ValidationError('Invalid export format')

    const result = await exportNarrative(idResult.data, fmtResult.data)
    return sendExport(result)
  } catch (err) {
    return apiError(err)
  }
}
