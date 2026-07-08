/**
 * GET /api/documents — list all uploaded documents (most recent first).
 * Optional ?status= filter.
 *
 * Thin wrapper over the document service. The response shape
 * ({ documents: [...] }) is the legacy contract the frontend consumes, so it
 * is preserved verbatim — only the source of the data moves into the service.
 */
import { NextRequest, NextResponse } from 'next/server'
import { listDocuments } from '@/lib/services/document.service'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'

export async function GET(req: NextRequest) {
  const blocked = await securityCheck(req, `documents:${getClientIP(req)}`, 30)
  if (blocked) return blocked

  const status = req.nextUrl.searchParams.get('status') || undefined

  try {
    const { documents } = await listDocuments({
      status,
      limit: 100,
      offset: 0,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    })
    return NextResponse.json({ documents })
  } catch {
    return NextResponse.json(
      { error: 'Failed to list documents.' },
      { status: 500 },
    )
  }
}
