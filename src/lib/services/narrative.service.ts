/**
 * Lemniscate — Narrative Service
 * ----------------------------------------------------------------------------
 * Business logic for retrieving narratives with all analysis artifacts.
 * Handles pagination, scene-paragraph attachment, and metadata parsing.
 */

import { db } from '@/lib/db'
import { NotFoundError } from '@/lib/domain/errors'

// ─── Types ────────────────────────────────────────────────────────────────

export interface NarrativeDetailOptions {
  view?: 'all' | 'summary'
  paraLimit?: number
  paraOffset?: number
  sceneLimit?: number
  sceneOffset?: number
}

// ─── v2 analysis (parsed from Narrative.metadata) ─────────────────────────

/**
 * The structured v2 analysis artifacts. The pipeline persists these into the
 * Narrative `metadata` JSON column as an opaque string (see orchestrator.ts →
 * persistCinematified). This typed view surfaces them to the reader without the
 * client having to JSON.parse defensively. All fields are optional: older
 * narratives (ORIGINAL mode, or pre-v2 rows) carry `{}` or no metadata.
 */
export interface NarrativeAnalysis {
  /** Character-level intelligence: roles, protagonist/antagonist, viewpoint. */
  intelligence?: unknown
  /** Undirected co-occurrence graph (scene-level character pairs). */
  coOccurrence?: unknown
  /** Per-scene emotional timeline points (valence / arousal / dominant). */
  emotionTimeline?: unknown[]
  /** Per-scene normalized momentum timeline points. */
  momentumTimeline?: unknown[]
  /** Detected dramatic structure: segments + phases across scenes. */
  structure?: unknown
  /** Counts persisted alongside the full arc/peak rows (which live in tables). */
  arcs?: number
  peaks?: number
  events?: number
  transforms?: string[]
}

/**
 * Defensively parse the v2 analysis out of a narrative's metadata JSON string.
 * Never throws: malformed/empty metadata yields null. ORIGINAL-mode narratives
 * have no v2 analysis (only CINEMATIFIED rows are populated by the pipeline).
 */
export function parseNarrativeAnalysis(rawMetadata: string | null | undefined): NarrativeAnalysis | null {
  if (!rawMetadata) return null
  try {
    const parsed = JSON.parse(rawMetadata) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return null
    const has = (k: string) => k in parsed
    if (!['intelligence', 'coOccurrence', 'emotionTimeline', 'momentumTimeline', 'structure', 'transforms'].some(has)) {
      return null
    }
    return {
      intelligence: parsed.intelligence,
      coOccurrence: parsed.coOccurrence,
      emotionTimeline: Array.isArray(parsed.emotionTimeline) ? parsed.emotionTimeline : undefined,
      momentumTimeline: Array.isArray(parsed.momentumTimeline) ? parsed.momentumTimeline : undefined,
      structure: parsed.structure,
      arcs: typeof parsed.arcs === 'number' ? parsed.arcs : undefined,
      peaks: typeof parsed.peaks === 'number' ? parsed.peaks : undefined,
      events: typeof parsed.events === 'number' ? parsed.events : undefined,
      transforms: Array.isArray(parsed.transforms) ? (parsed.transforms as string[]) : undefined,
    }
  } catch {
    return null
  }
}

// ─── Service methods ──────────────────────────────────────────────────────

/**
 * Get a narrative with all artifacts: paragraphs, scenes (with source paragraphs),
 * characters, locations, arcs, peaks, events.
 */
export async function getNarrative(id: string, opts: NarrativeDetailOptions = {}) {
  const paraLimit = Math.min(200, Math.max(1, opts.paraLimit ?? 50))
  const paraOffset = Math.max(0, opts.paraOffset ?? 0)
  const sceneLimit = Math.min(100, Math.max(1, opts.sceneLimit ?? 50))
  const sceneOffset = Math.max(0, opts.sceneOffset ?? 0)
  const view = opts.view ?? 'all'

  const narrative = await db.narrative.findUnique({
    where: { id },
    include: {
      document: { select: { id: true, originalName: true, status: true } },
      paragraphs: { orderBy: { index: 'asc' }, take: paraLimit, skip: paraOffset },
      scenes: {
        orderBy: { index: 'asc' },
        take: sceneLimit,
        skip: sceneOffset,
        include: { events: { orderBy: { index: 'asc' } } },
      },
      characters: { orderBy: { mentions: 'desc' } },
      locations: { orderBy: { mentions: 'desc' } },
      arcs: { orderBy: { startSceneIdx: 'asc' } },
      peaks: { orderBy: { intensity: 'desc' }, take: 50 },
    },
  })

  if (!narrative) throw new NotFoundError(`Narrative '${id}' not found`)

  if (view === 'summary') {
    return {
      narrative: {
        id: narrative.id,
        title: narrative.title,
        mode: narrative.mode,
        wordCount: narrative.wordCount,
        charCount: narrative.charCount,
        readingTimeMin: narrative.readingTimeMin,
        paragraphCount: narrative.paragraphCount,
        sceneCount: narrative.sceneCount,
        createdAt: narrative.createdAt,
        document: narrative.document,
        metadata: narrative.metadata,
        analysis: parseNarrativeAnalysis(narrative.metadata),
      },
    }
  }

  // Attach source paragraphs to each returned scene by offset range.
  const sceneList = narrative.scenes
  let sceneParagraphs: typeof narrative.paragraphs = []
  if (sceneList.length > 0) {
    const minStart = Math.min(...sceneList.map((s) => s.startOffset))
    const maxEnd = Math.max(...sceneList.map((s) => s.endOffset))
    sceneParagraphs = await db.paragraph.findMany({
      where: { narrativeId: id, startOffset: { gte: minStart, lte: maxEnd } },
      orderBy: { index: 'asc' },
    })
  }

  const scenesWithParas = sceneList.map((scene) => ({
    ...scene,
    paragraphs: sceneParagraphs.filter(
      (p) => p.startOffset >= scene.startOffset && p.startOffset <= scene.endOffset,
    ),
  }))

  const events = scenesWithParas.flatMap((s) => s.events)

  return {
    narrative: {
      ...narrative,
      scenes: scenesWithParas,
      events,
      analysis: parseNarrativeAnalysis(narrative.metadata),
    },
    pagination: {
      paragraphs: { limit: paraLimit, offset: paraOffset },
      scenes: { limit: sceneLimit, offset: sceneOffset },
    },
  }
}

/**
 * List narratives for a document.
 */
export async function listNarrativesForDocument(documentId: string) {
  return db.narrative.findMany({
    where: { documentId },
    select: {
      id: true,
      mode: true,
      title: true,
      sceneCount: true,
      wordCount: true,
      readingTimeMin: true,
      paragraphCount: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Get reading progress for a narrative.
 */
export async function getReadingProgress(narrativeId: string) {
  return db.readingProgress.findUnique({ where: { narrativeId } })
}

/**
 * Upsert reading progress for a narrative.
 */
export async function upsertReadingProgress(
  narrativeId: string,
  scrollPct: number,
  sceneIndex: number,
  paragraphIdx: number,
) {
  return db.readingProgress.upsert({
    where: { narrativeId },
    create: { narrativeId, scrollPct, sceneIndex, paragraphIdx },
    update: { scrollPct, sceneIndex, paragraphIdx },
  })
}

/**
 * Get all narratives that have active reading progress.
 */
export async function getReadingList() {
  const progress = await db.readingProgress.findMany({
    include: {
      narrative: {
        select: {
          id: true,
          title: true,
          mode: true,
          sceneCount: true,
          wordCount: true,
          readingTimeMin: true,
          document: { select: { id: true, originalName: true } },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })
  return progress
}

// ─── Bookmarks ────────────────────────────────────────────────────────────

export async function listBookmarks(narrativeId: string) {
  return db.bookmark.findMany({
    where: { narrativeId },
    orderBy: { offset: 'asc' },
  })
}

export async function createBookmark(
  narrativeId: string,
  offset: number,
  sceneIndex?: number,
  paragraphIdx?: number,
  label?: string,
  note?: string,
) {
  return db.bookmark.create({
    data: {
      narrativeId,
      offset,
      sceneIndex: sceneIndex ?? null,
      paragraphIdx: paragraphIdx ?? null,
      label: label ?? null,
      note: note ?? null,
    },
  })
}

export async function deleteBookmark(narrativeId: string, bookmarkId: string) {
  return db.bookmark.deleteMany({
    where: { id: bookmarkId, narrativeId },
  })
}