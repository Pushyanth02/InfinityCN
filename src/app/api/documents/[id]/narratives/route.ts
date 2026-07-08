/**
 * GET /api/documents/[id]/narratives — list narratives for a document.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateIdParam } from '@/lib/middleware/validate-id'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const blocked = securityCheck(_req, `doc-narratives:${getClientIP(_req)}`, 30)
  if (blocked) return blocked

  const { id } = await ctx.params
  const invalid = validateIdParam(id, 'documentId')
  if (invalid) return invalid
  const narratives = await db.narrative.findMany({
    where: { documentId: id },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { scenes: true, characters: true, locations: true, events: true, paragraphs: true, arcs: true, peaks: true } } },
  })
  return NextResponse.json({ narratives })
}
