/**
 * GET  /api/narratives/[id]/progress — get reading progress
 * POST /api/narratives/[id]/progress — upsert reading progress
 *   body: { scrollPct, sceneIndex, paragraphIdx }
 *
 * Legacy (unversioned) surface. Delegates to the service layer for all
 * business logic (including the P2003 / stale-id guard) but preserves its
 * flat `{ progress }` / `{ error }` response envelope — the frontend and the
 * progress regression tests depend on this exact shape. The versioned twin
 * lives at /api/v1/narratives/[id]/progress and uses the standard envelope.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  getReadingProgress,
  upsertReadingProgress,
} from '@/lib/services/narrative.service'
import { isDomainError, getErrorStatusCode } from '@/lib/domain/errors'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'
import { validateIdParam } from '@/lib/middleware/validate-id'
import { enforceBodySize } from '@/lib/middleware/body-size'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const blocked = await securityCheck(req, `progress:${getClientIP(req)}`, 60)
  if (blocked) return blocked

  const { id } = await ctx.params
  const invalid = validateIdParam(id, 'narrativeId')
  if (invalid) return invalid

  const progress = await getReadingProgress(id)
  // Legacy contract: 200 with `{ progress: null }` when none exists yet —
  // the reader treats absence as "no saved position", not a 404.
  return NextResponse.json({ progress })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const blocked = await securityCheck(req, `progress:${getClientIP(req)}`, 30)
  if (blocked) return blocked
  const tooLarge = enforceBodySize(req)
  if (tooLarge) return tooLarge

  const { id } = await ctx.params
  const invalid = validateIdParam(id, 'narrativeId')
  if (invalid) return invalid

  let body: ProgressBody
  try {
    body = (await req.json()) as ProgressBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Defensive clamping — the v1 route validates via Zod, but this legacy
  // surface must stay tolerant of loose client input (e.g. scrollPct: 999).
  const scrollPct = clamp(toInt(body.scrollPct), 0, 100)
  const sceneIndex = Math.max(0, toInt(body.sceneIndex))
  const paragraphIdx = Math.max(0, toInt(body.paragraphIdx))

  try {
    const progress = await upsertReadingProgress(id, scrollPct, sceneIndex, paragraphIdx)
    return NextResponse.json({ progress })
  } catch (err) {
    // Stale narrative id (deleted in another tab) → 404, matching the
    // P2003-regression contract pinned by progress.test.ts.
    const status = getErrorStatusCode(err)
    const message = isDomainError(err) ? err.message : 'Failed to save progress'
    return NextResponse.json({ error: message }, { status })
  }
}

interface ProgressBody {
  scrollPct?: number
  sceneIndex?: number
  paragraphIdx?: number
}

function toInt(x: unknown): number {
  const n = typeof x === 'number' ? x : Number(x)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x))
}
