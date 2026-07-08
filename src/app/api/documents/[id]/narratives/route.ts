/**
 * GET /api/documents/[id]/narratives — list narratives for a document.
 *
 * Thin wrapper over the narrative service. Consumers (library + reader) read
 * only `data.narratives[].id` and `.mode`; the service returns a superset
 * (title, counts, etc.) which is harmless.
 */
import { NextRequest, NextResponse } from 'next/server'
import { listNarrativesForDocument } from '@/lib/services/narrative.service'
import { validateIdParam } from '@/lib/middleware/validate-id'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const blocked = await securityCheck(_req, `doc-narratives:${getClientIP(_req)}`, 30)
  if (blocked) return blocked

  const { id } = await ctx.params
  const invalid = validateIdParam(id, 'documentId')
  if (invalid) return invalid

  const narratives = await listNarrativesForDocument(id)
  return NextResponse.json({ narratives })
}
