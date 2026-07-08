/**
 * GET   /api/narratives/[id]/bookmarks — list bookmarks
 * POST  /api/narratives/[id]/bookmarks — create a bookmark
 *   body: { sceneIndex?, paragraphIdx?, offset, label?, note? }
 * DELETE /api/narratives/[id]/bookmarks?bookmarkId=xxx — delete a bookmark
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'
import { validateIdParam } from '@/lib/middleware/validate-id'
import { enforceBodySize } from '@/lib/middleware/body-size'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const invalid = validateIdParam(id, 'narrativeId')
  if (invalid) return invalid
  const bookmarks = await db.bookmark.findMany({
    where: { narrativeId: id },
    orderBy: { offset: 'asc' },
  })
  return NextResponse.json({ bookmarks })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const blocked = securityCheck(req, `bookmarks:${getClientIP(req)}`, 20)
  if (blocked) return blocked
  const tooLarge = enforceBodySize(req)
  if (tooLarge) return tooLarge

  const { id } = await ctx.params
  const invalid = validateIdParam(id, 'narrativeId')
  if (invalid) return invalid
  const body = await req.json()
  const bookmark = await db.bookmark.create({
    data: {
      narrativeId: id,
      sceneIndex: body.sceneIndex ?? null,
      paragraphIdx: body.paragraphIdx ?? null,
      offset: body.offset ?? 0,
      label: body.label ?? null,
      note: body.note ?? null,
    },
  })
  return NextResponse.json({ bookmark })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const blocked = securityCheck(req, `bookmarks:${getClientIP(req)}`, 20)
  if (blocked) return blocked

  const { id: narrativeId } = await ctx.params
  const invalidNarrative = validateIdParam(narrativeId, 'narrativeId')
  if (invalidNarrative) return invalidNarrative
  const bookmarkId = req.nextUrl.searchParams.get('bookmarkId')
  if (!bookmarkId) return NextResponse.json({ error: 'bookmarkId required' }, { status: 400 })
  const invalidBookmark = validateIdParam(bookmarkId, 'bookmarkId')
  if (invalidBookmark) return invalidBookmark
  // Scope the delete to the narrative so a bookmark ID from another narrative
  // cannot be removed via this route.
  const result = await db.bookmark.deleteMany({ where: { id: bookmarkId, narrativeId } })
  if (result.count === 0) return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
