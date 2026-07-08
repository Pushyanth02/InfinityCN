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

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const blocked = await securityCheck(req, `bookmarks:${getClientIP(req)}`, 60)
  if (blocked) return blocked

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
  const blocked = await securityCheck(req, `bookmarks:${getClientIP(req)}`, 20)
  if (blocked) return blocked
  const tooLarge = enforceBodySize(req)
  if (tooLarge) return tooLarge

  const { id } = await ctx.params
  const invalid = validateIdParam(id, 'narrativeId')
  if (invalid) return invalid
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Validate and sanitize bookmark fields
  const sceneIndex = typeof body.sceneIndex === 'number' && Number.isFinite(body.sceneIndex)
    ? Math.max(0, Math.trunc(body.sceneIndex)) : null
  const paragraphIdx = typeof body.paragraphIdx === 'number' && Number.isFinite(body.paragraphIdx)
    ? Math.max(0, Math.trunc(body.paragraphIdx)) : null
  const offset = typeof body.offset === 'number' && Number.isFinite(body.offset)
    ? Math.max(0, Math.trunc(body.offset)) : 0
  const label = typeof body.label === 'string' ? body.label.slice(0, 200).trim() || null : null
  const note = typeof body.note === 'string' ? body.note.slice(0, 1000).trim() || null : null

  const bookmark = await db.bookmark.create({
    data: { narrativeId: id, sceneIndex, paragraphIdx, offset, label, note },
  })
  return NextResponse.json({ bookmark })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const blocked = await securityCheck(req, `bookmarks:${getClientIP(req)}`, 20)
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
