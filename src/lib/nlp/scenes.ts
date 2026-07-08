/**
 * Lemniscate — Scene Detection Engine v2 (Task 5)
 * ----------------------------------------------------------------------------
 * Deterministic scene segmentation driven by a weighted blend of structural
 * and semantic signals. Boundaries are stable (identical input ⇒ identical
 * segmentation) and every scene's paragraphs are preserved VERBATIM — the
 * engine only groups existing paragraphs, it never rewrites their text.
 *
 * Signals (each contributes to a boundary score at a paragraph transition):
 *   - chapter/heading boundaries      (structural, decisive)
 *   - explicit transition paragraphs  (structural)
 *   - temporal-shift lead words       (semantic time jump)
 *   - location transitions            (gazetteer-based)
 *   - dialogue-cluster breaks         (dialogue → narration turn)
 *   - paragraph density / scene span  (soft length-based split)
 *   - topic shifts                    (low lexical overlap)
 *
 * A boundary is opened when the summed score meets {@link BOUNDARY_THRESHOLD}.
 */

import {
  STOP_WORDS,
  TEMPORAL_SHIFT,
  LOCATION_INDOOR,
  LOCATION_OUTDOOR,
  LOCATION_URBAN,
  LOCATION_NATURE,
  LOCATION_VEHICLE,
  normalizeToken,
} from './lexicons'

/** Minimal paragraph contract consumed by the scene engine. */
export interface ParagraphLike {
  type: string
  text: string
  charCount: number
  startOffset: number
  endOffset: number
}

/** A detected scene: a verbatim group of source paragraphs + span metrics. */
export interface SceneSegment<P extends ParagraphLike = ParagraphLike> {
  index: number
  paragraphs: P[]
  startOffset: number
  endOffset: number
  charCount: number
  paragraphCount: number
  /** Ratio of dialogue characters to total scene characters, [0,1]. */
  dialogueRatio: number
  /** Dominant location token for the scene (lowercased) or null. */
  location: string | null
  /** Human-readable trace of the signals that opened this scene. */
  boundarySignals: string[]
}

// ---- Signal weights (documented, deterministic) ---------------------------
const W_HEADING = 100
const W_TRANSITION = 60
const W_TEMPORAL = 50
const W_LOCATION = 40
const W_DIALOGUE_BREAK = 20
const W_TOPIC_SHIFT = 25
const W_SOFT_LENGTH = 35
const W_HARD_LENGTH = 80
const BOUNDARY_THRESHOLD = 50

// Scene-span limits (characters) that drive soft/hard length splitting.
const SOFT_LENGTH_LIMIT = 1600
const HARD_LENGTH_LIMIT = 3200
// Minimum paragraphs before topic-shift / length splits may fire.
const MIN_PARAGRAPHS_FOR_SEMANTIC_SPLIT = 3

/** Union location gazetteer (lowercased tokens) — built once. */
const LOCATION_WORDS: Set<string> = (() => {
  const all = new Set<string>()
  for (const gaz of [LOCATION_INDOOR, LOCATION_OUTDOOR, LOCATION_URBAN, LOCATION_NATURE, LOCATION_VEHICLE]) {
    for (const w of gaz) all.add(w.toLowerCase())
  }
  return all
})()

/** Content-word set for a paragraph (lowercased, stop-words removed). */
function contentWords(text: string): Set<string> {
  const set = new Set<string>()
  for (const raw of text.split(/\s+/)) {
    const w = normalizeToken(raw)
    if (w.length >= 3 && !STOP_WORDS.has(w)) set.add(w)
  }
  return set
}

/** Jaccard overlap between two content-word sets in [0,1]. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  for (const w of small) if (large.has(w)) inter++
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}

/** Dominant location token present in a paragraph, or null. */
function dominantLocation(text: string): string | null {
  const counts = new Map<string, number>()
  for (const raw of text.split(/\s+/)) {
    const w = normalizeToken(raw)
    if (LOCATION_WORDS.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1)
  }
  if (counts.size === 0) return null
  let best: string | null = null
  let bestCount = 0
  // Deterministic: highest count, ties broken alphabetically.
  for (const [w, c] of [...counts.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
    if (c > bestCount) { best = w; bestCount = c }
  }
  return best
}

/** Leading temporal-shift phrase detector (checks 1–3 leading words). */
function hasTemporalShift(text: string): boolean {
  const words = text.trim().toLowerCase().split(/\s+/)
  for (let n = 3; n >= 1; n--) {
    if (words.length < n) continue
    const phrase = words.slice(0, n).join(' ').replace(/[^a-z ]/g, '').trim()
    if (TEMPORAL_SHIFT.has(phrase)) return true
  }
  return false
}

/**
 * Segment paragraphs into deterministic scenes. Returns at least one scene for
 * any non-empty input; an empty input yields an empty array.
 */
export function detectScenes<P extends ParagraphLike>(paragraphs: P[]): SceneSegment<P>[] {
  if (paragraphs.length === 0) return []

  const scenes: SceneSegment<P>[] = []
  let current: P[] = []
  let sceneIndex = 0
  let sceneCharCount = 0
  let currentLocation: string | null = null
  let prevContent: Set<string> | null = null
  let dialogueRun = 0
  let pendingSignals: string[] = []

  const flush = () => {
    if (current.length === 0) return
    const startOffset = current[0].startOffset
    const endOffset = current[current.length - 1].endOffset
    const totalChars = current.reduce((a, p) => a + p.charCount, 0)
    const dialogueChars = current
      .filter((p) => p.type === 'DIALOGUE')
      .reduce((a, p) => a + p.charCount, 0)
    scenes.push({
      index: sceneIndex++,
      paragraphs: current,
      startOffset,
      endOffset,
      charCount: totalChars,
      paragraphCount: current.length,
      dialogueRatio: totalChars > 0 ? dialogueChars / totalChars : 0,
      location: currentLocation,
      boundarySignals: pendingSignals,
    })
    current = []
    sceneCharCount = 0
  }

  for (const p of paragraphs) {
    const signals: string[] = []
    let score = 0

    const isHeading = p.type === 'HEADING'
    const isTransition = p.type === 'TRANSITION'
    const pLocation = dominantLocation(p.text)
    const content = contentWords(p.text)

    if (current.length > 0) {
      if (isHeading) { score += W_HEADING; signals.push('heading') }
      if (isTransition && current.length >= 2) { score += W_TRANSITION; signals.push('transition') }
      if (hasTemporalShift(p.text)) { score += W_TEMPORAL; signals.push('temporal') }
      if (pLocation && currentLocation && pLocation !== currentLocation && current.length >= 2) {
        score += W_LOCATION
        signals.push('location')
      }
      if (dialogueRun >= 2 && p.type !== 'DIALOGUE') { score += W_DIALOGUE_BREAK; signals.push('dialogue-break') }
      if (
        current.length >= MIN_PARAGRAPHS_FOR_SEMANTIC_SPLIT &&
        prevContent &&
        p.type !== 'DIALOGUE' &&
        jaccard(prevContent, content) < 0.06
      ) {
        score += W_TOPIC_SHIFT
        signals.push('topic-shift')
      }
      if (sceneCharCount >= HARD_LENGTH_LIMIT && p.type !== 'DIALOGUE') {
        score += W_HARD_LENGTH
        signals.push('hard-length')
      } else if (
        sceneCharCount >= SOFT_LENGTH_LIMIT &&
        p.type !== 'DIALOGUE' &&
        current.length >= MIN_PARAGRAPHS_FOR_SEMANTIC_SPLIT
      ) {
        score += W_SOFT_LENGTH
        signals.push('soft-length')
      }
    }

    if (score >= BOUNDARY_THRESHOLD) {
      flush()
      pendingSignals = signals
      currentLocation = pLocation
    } else if (pLocation && !currentLocation) {
      currentLocation = pLocation
    } else if (pLocation) {
      currentLocation = pLocation
    }

    current.push(p)
    sceneCharCount += p.charCount
    prevContent = content
    if (p.type === 'DIALOGUE') dialogueRun += 1
    else dialogueRun = 0
  }
  flush()

  return scenes
}
