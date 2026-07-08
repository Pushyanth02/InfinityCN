/**
 * GET    /api/documents/[id] — full document detail w/ jobs + raw text summary
 * DELETE /api/documents/[id] — remove document, its files, and all artifacts
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { deleteFile } from '@/lib/storage'
import { validateIdParam } from '@/lib/middleware/validate-id'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const blocked = securityCheck(_req, `document:${getClientIP(_req)}`, 30)
  if (blocked) return blocked

  const { id } = await ctx.params
  const invalid = validateIdParam(id, 'documentId')
  if (invalid) return invalid
  const doc = await db.document.findUnique({
    where: { id },
    include: {
      rawText: true,
      jobs: { orderBy: { createdAt: 'desc' } },
      narratives: {
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { scenes: true, characters: true, locations: true, events: true, paragraphs: true } } },
      },
    },
  })
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  return NextResponse.json({ document: doc })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const blocked = securityCheck(_req, `doc-delete:${getClientIP(_req)}`, 10)
  if (blocked) return blocked

  const { id } = await ctx.params
  const invalid = validateIdParam(id, 'documentId')
  if (invalid) return invalid
  const doc = await db.document.findUnique({ where: { id }, select: { id: true, storageName: true } })
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  // Delete DB row FIRST (cascade handles jobs/narratives/artifacts), then
  // best-effort delete the file so a file-system error doesn't orphan DB rows.
  await db.document.delete({ where: { id: doc.id } })
  if (doc.storageName) {
    try { await deleteFile(doc.storageName) } catch { /* best-effort */ }
  }
  return NextResponse.json({ ok: true })
}
