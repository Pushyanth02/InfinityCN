/**
 * Lemniscate — Pipeline Orchestrator
 * ----------------------------------------------------------------------------
 * Ties together: extraction → original transform → cinematified transform.
 * Emits ProgressEvents via the EventBus so the worker + websocket service
 * can stream live progress to the UI.
 *
 * Deterministic, offline, no AI.
 */

import { db } from '../db'
import { extractText, hashText } from './extract'
import { transformOriginal, type OriginalResult } from './original'
import { transformCinematified, type CinematifiedResult } from './cinematified'
import { detectDocumentMetadata, type DetectedMetadata } from './metadata'
import { computeStats } from '../nlp/core'
import { eventBus } from '../events/bus'
import type { ProgressEvent, PipelineStage } from '../types'
import { uploadPath } from '../storage'

export interface PipelineRunOptions {
  jobId: string
  documentId: string
  mode: 'ORIGINAL' | 'CINEMATIFIED' | 'BOTH'
}

export interface PipelineRunResult {
  narrativeIds: string[]
  sceneCount: number
  characterCount: number
  durationMs: number
}

export async function runPipeline(opts: PipelineRunOptions): Promise<PipelineRunResult> {
  const startedAt = Date.now()
  const { jobId, documentId, mode } = opts

  await setJobStage(jobId, 'EXTRACT', 5, 'Extracting text from source document…')
  const doc = await db.document.findUnique({ where: { id: documentId } })
  if (!doc) throw new Error(`Document ${documentId} not found`)

  // ---- 1. Extract (read the stored file directly — no temp-file round-trip) ----
  const filePath = uploadPath(doc.storageName)
  let extracted
  try {
    extracted = await extractText(filePath, doc.mimeType)
  } catch (err) {
    await failJob(jobId, `Extraction error: ${(err as Error).message}`)
    throw err
  }
  if (!extracted.text.trim()) {
    const detail = extracted.warnings.length
      ? extracted.warnings.join('; ')
      : 'the file has no recoverable text layer'
    const pageInfo = extracted.meta?.pageCount != null ? ` (pages detected: ${extracted.meta.pageCount})` : ''
    await failJob(
      jobId,
      `Extraction produced no text via the ${extracted.extractor} extractor${pageInfo}. Reason: ${detail}. ` +
        `Recommended action: confirm the document contains selectable text (image-only/scanned PDFs are not supported without OCR).`,
    )
    throw new Error('Empty extraction')
  }

  await db.rawText.upsert({
    where: { documentId },
    create: {
      documentId,
      content: extracted.text,
      charCount: extracted.charCount,
      wordCount: extracted.wordCount,
      lineCount: extracted.lineCount,
      language: extracted.language,
      encoding: extracted.encoding,
    },
    update: {
      content: extracted.text,
      charCount: extracted.charCount,
      wordCount: extracted.wordCount,
      lineCount: extracted.lineCount,
      language: extracted.language,
      encoding: extracted.encoding,
    },
  })
  await db.document.update({ where: { id: documentId }, data: { status: 'EXTRACTED' } })
  await log(
    jobId,
    'EXTRACT',
    extracted.warnings.length ? 'WARN' : 'INFO',
    `Extracted ${extracted.charCount} chars / ${extracted.wordCount} words via ${extracted.extractor}` +
      (extracted.meta?.pageCount != null ? ` from ${extracted.meta.pageCount} page(s)` : '') +
      '.',
    { warnings: extracted.warnings, meta: extracted.meta, language: extracted.language },
  )
  await setJobStage(jobId, 'SEGMENT', 20, `Extracted ${extracted.wordCount} words. Segmenting…`)

  // ---- 2. Reconstruct paragraphs ONCE -----------------------------------
  // The same paragraph reconstruction feeds metadata detection, ORIGINAL
  // persistence, and CINEMATIFIED scene segmentation. Computing it once (rather
  // than 2–3× as before) is both correct and a measurable performance win.
  const filenameBase = doc.originalName.replace(/\.[^.]+$/, '')
  const baseOriginal = transformOriginal(extracted.text, filenameBase)

  // ---- 2b. Detect document metadata (title/author/series/chapters/…) -----
  const metadata = detectDocumentMetadata({
    text: extracted.text,
    paragraphs: baseOriginal.paragraphs,
    embedded: extracted.embedded,
    filename: doc.originalName,
    language: extracted.language,
  })
  await persistDocumentMetadata(documentId, metadata)
  await log(
    jobId,
    'SEGMENT',
    'INFO',
    `Detected title "${metadata.title}" (source: ${metadata.titleSource})` +
      (metadata.author ? ` by ${metadata.author}` : '') +
      `; ${metadata.chapterCount} chapter(s); language=${metadata.language}.`,
    {
      title: metadata.title,
      titleSource: metadata.titleSource,
      author: metadata.author,
      subtitle: metadata.subtitle,
      series: metadata.series,
      chapterCount: metadata.chapterCount,
      language: metadata.language,
    },
  )

  // ---- 3. Original mode -------------------------------------------------
  const narrativeIds: string[] = []
  let sceneCount = 0
  let characterCount = 0

  const runOriginal = mode === 'ORIGINAL' || mode === 'BOTH'
  const runCinema = mode === 'CINEMATIFIED' || mode === 'BOTH'

  let original: OriginalResult | null = null
  if (runOriginal) {
    await setJobStage(jobId, 'ORIGINAL', 35, 'Reconstructing paragraphs (ORIGINAL MODE)…')
    original = retitleOriginal(baseOriginal, metadata.title)
    await log(jobId, 'ORIGINAL', 'INFO', `Reconstructed ${original.paragraphs.length} paragraphs.`, { transforms: original.transforms })
    const nid = await persistNarrative(jobId, documentId, 'ORIGINAL', original)
    narrativeIds.push(nid)
    await setJobStage(jobId, 'ORIGINAL', 55, `Original narrative ready (${original.paragraphs.length} paragraphs).`)
  }

  // ---- 4. Cinematified mode ---------------------------------------------
  if (runCinema) {
    await setJobStage(jobId, 'CINEMATIFY', 65, 'Detecting scenes, characters, and locations (CINEMATIFIED MODE)…')
    // Reuse the already-reconstructed paragraphs; pass the detected title.
    const cinema = transformCinematified(extracted.text, baseOriginal.paragraphs, metadata.title)
    sceneCount = cinema.sceneCount
    characterCount = cinema.characters.length
    await log(jobId, 'CINEMATIFY', 'INFO', `${cinema.sceneCount} scenes, ${cinema.characters.length} characters, ${cinema.locations.length} locations, ${cinema.events.length} events.`, { transforms: cinema.transforms })
    await setJobStage(jobId, 'ANALYZE', 80, `Detected ${cinema.sceneCount} scenes & ${cinema.characters.length} characters. Building narrative…`)
    const nid = await persistCinematified(jobId, documentId, cinema)
    narrativeIds.push(nid)
  }

  // ---- 5. Finalize ------------------------------------------------------
  await setJobStage(jobId, 'FINALIZE', 95, 'Finalizing narrative artifacts…')
  await db.document.update({ where: { id: documentId }, data: { status: 'PROCESSED' } })
  const durationMs = Date.now() - startedAt
  await db.job.update({
    where: { id: jobId },
    data: { status: 'COMPLETED', progress: 100, stage: 'COMPLETED', completedAt: new Date(), durationMs },
  })
  await log(jobId, 'FINALIZE', 'INFO', `Pipeline complete in ${durationMs}ms.`, { narrativeIds, sceneCount, characterCount })

  const completeEvt: ProgressEvent = {
    type: 'complete',
    jobId,
    documentId,
    stage: 'COMPLETED',
    progress: 100,
    timestamp: Date.now(),
    result: { narrativeIds, sceneCount, characterCount, durationMs },
  }
  eventBus.publish(completeEvt)
  // Free the per-job event history after a short delay (lets late-joiners replay).
  setTimeout(() => eventBus.clear(jobId), 60_000)

  return { narrativeIds, sceneCount, characterCount, durationMs }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/** Persist detected document metadata so the library can display real titles. */
async function persistDocumentMetadata(documentId: string, m: DetectedMetadata): Promise<void> {
  await db.document.update({
    where: { id: documentId },
    data: {
      title: m.title,
      titleSource: m.titleSource,
      author: m.author,
      subtitle: m.subtitle,
      series: m.series,
      language: m.language,
      wordCount: m.wordCount,
      readingTimeMin: m.readingTimeMin,
      chapterCount: m.chapterCount,
      detectedMeta: JSON.stringify({
        titleSource: m.titleSource,
        chapters: m.chapters,
      }),
    },
  })
}

/**
 * Apply the detected title to an already-computed ORIGINAL result without
 * re-running the (expensive) paragraph reconstruction. Only the title and the
 * leading H1 of the rendered markdown change; content is otherwise identical.
 */
function retitleOriginal(r: OriginalResult, title: string): OriginalResult {
  if (r.title === title) return r
  const content = r.content.replace(/^#\s+.*$/m, `# ${title.replace(/\$/g, '$$$$')}`)
  return { ...r, title, content }
}

async function persistNarrative(jobId: string, documentId: string, mode: 'ORIGINAL', r: OriginalResult): Promise<string> {
  const stats = r.stats
  const narrative = await db.narrative.create({
    data: {
      documentId,
      jobId,
      mode,
      title: r.title,
      content: r.content,
      plainText: r.plainText,
      wordCount: stats.wordCount,
      charCount: stats.charCount,
      readingTimeMin: stats.readingTimeMin,
      paragraphCount: r.paragraphs.length,
      sceneCount: 0,
      metadata: JSON.stringify({ transforms: r.transforms, stats }),
    },
  })
  await db.paragraph.createMany({
    data: r.paragraphs.map((p) => ({
      narrativeId: narrative.id,
      index: p.index,
      text: p.text,
      type: p.type,
      speaker: p.speaker ?? null,
      rawText: p.rawText,
      wordCount: p.wordCount,
      charCount: p.charCount,
      startOffset: p.startOffset,
      endOffset: p.endOffset,
    })),
  })
  return narrative.id
}

async function persistCinematified(jobId: string, documentId: string, r: CinematifiedResult): Promise<string> {
  const cinemaStats = computeStats(r.plainText)
  const narrative = await db.narrative.create({
    data: {
      documentId,
      jobId,
      mode: 'CINEMATIFIED',
      title: r.title,
      content: r.content,
      plainText: r.plainText,
      wordCount: cinemaStats.wordCount,
      charCount: cinemaStats.charCount,
      readingTimeMin: cinemaStats.readingTimeMin,
      paragraphCount: r.scenes.reduce((a, s) => a + s.paragraphCount, 0),
      sceneCount: r.sceneCount,
      // Rich, deterministic analysis artifacts persisted as JSON metadata
      // (hybrid persistence: scalar metrics are promoted to columns; graphs and
      // timelines live here). All bounded in size.
      metadata: JSON.stringify({
        transforms: r.transforms,
        arcs: r.arcs.length,
        peaks: r.peaks.length,
        events: r.events.length,
        intelligence: r.intelligence,
        coOccurrence: r.coOccurrence,
        emotionTimeline: r.emotionTimeline,
        momentumTimeline: r.momentumTimeline,
        structure: r.structure,
      }),
    },
  })

  // paragraphs (flatten all scenes' source paragraphs)
  let pIdx = 0
  const paraRows: Array<{
    narrativeId: string
    index: number
    text: string
    type: string
    speaker: string | null
    rawText: string
    wordCount: number
    charCount: number
    startOffset: number
    endOffset: number
  }> = []
  for (const scene of r.scenes) {
    for (const p of scene.paragraphs) {
      paraRows.push({
        narrativeId: narrative.id,
        index: pIdx++,
        text: p.text,
        type: p.type,
        speaker: p.speaker ?? null,
        rawText: p.rawText,
        wordCount: p.wordCount,
        charCount: p.charCount,
        startOffset: p.startOffset,
        endOffset: p.endOffset,
      })
    }
  }
  if (paraRows.length) await db.paragraph.createMany({ data: paraRows })

  // scenes
  if (r.scenes.length) {
    await db.scene.createMany({
      data: r.scenes.map((s) => ({
        narrativeId: narrative.id,
        index: s.index,
        title: s.title,
        summary: s.summary,
        location: s.location,
        timeOfDay: s.timeOfDay,
        mood: s.mood,
        tensionScore: s.tensionScore,
        emotionScore: s.emotionScore,
        momentumScore: s.momentumScore,
        arousalScore: s.arousalScore,
        valence: s.valence,
        structurePhase: s.structurePhase,
        startOffset: s.startOffset,
        endOffset: s.endOffset,
        charCount: s.charCount,
        paragraphCount: s.paragraphCount,
        dialogueRatio: s.dialogueRatio,
        eventCount: s.eventCount,
      })),
    })
  }

  // characters
  if (r.characters.length) {
    await db.character.createMany({
      data: r.characters.map((c) => ({
        narrativeId: narrative.id,
        name: c.name,
        aliases: JSON.stringify(c.aliases),
        mentions: c.mentions,
        firstAppearanceOffset: c.firstAppearanceOffset,
        role: c.role,
        dialogueLines: c.dialogueLines,
        description: null,
        // Promoted scalar metrics.
        importanceScore: c.importanceScore,
        confidenceScore: c.confidenceScore,
        speakingCount: c.speakingCount,
        lastAppearanceOffset: c.lastAppearanceOffset,
        // JSON metadata: honorifics, gender, scene participation, stable id.
        metadata: JSON.stringify({
          id: c.id,
          honorifics: c.honorifics,
          gender: c.gender,
          scenes: c.scenes,
        }),
      })),
    })
  }

  // locations
  if (r.locations.length) {
    await db.location.createMany({
      data: r.locations.map((l) => ({
        narrativeId: narrative.id,
        name: l.name,
        mentions: l.mentions,
        type: l.type,
        firstAppearanceOffset: l.firstAppearanceOffset,
      })),
    })
  }

  // events (need scene ids)
  const sceneRows = await db.scene.findMany({ where: { narrativeId: narrative.id }, orderBy: { index: 'asc' } })
  if (r.events.length) {
    await db.event.createMany({
      data: r.events.map((e) => ({
        narrativeId: narrative.id,
        sceneId: sceneRows[e.sceneIndex]?.id ?? null,
        index: e.index,
        type: e.type,
        description: e.description,
        participants: JSON.stringify(e.participants),
        offset: e.offset,
        intensity: e.intensity,
      })),
    })
  }

  // arcs
  if (r.arcs.length) {
    await db.narrativeArc.createMany({
      data: r.arcs.map((a) => ({
        narrativeId: narrative.id,
        name: a.name,
        arcType: a.arcType,
        startSceneIdx: a.startSceneIdx,
        endSceneIdx: a.endSceneIdx,
        intensity: a.intensity,
        summary: a.summary,
      })),
    })
  }

  // emotional peaks
  if (r.peaks.length) {
    await db.emotionalPeak.createMany({
      data: r.peaks.map((p) => ({
        narrativeId: narrative.id,
        sceneId: p.sceneIndex !== null ? sceneRows[p.sceneIndex]?.id ?? null : null,
        offset: p.offset,
        intensity: p.intensity,
        emotion: p.emotion,
        snippet: p.snippet,
      })),
    })
  }

  return narrative.id
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setJobStage(jobId: string, stage: PipelineStage, progress: number, message: string) {
  await db.job.update({ where: { id: jobId }, data: { stage, progress, status: 'PROCESSING', startedAt: stage === 'EXTRACT' ? new Date() : undefined } })
  await log(jobId, stage, 'INFO', message)
  const evt: ProgressEvent = { type: 'stage', jobId, stage, progress, message, timestamp: Date.now() }
  eventBus.publish(evt)
  eventBus.publish({ type: 'progress', jobId, progress, timestamp: Date.now() })
}

async function log(jobId: string, stage: string, level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, metadata?: Record<string, unknown>) {
  await db.processingLog.create({
    data: { jobId, stage, level, message, metadata: JSON.stringify(metadata ?? {}) },
  })
  const evt: ProgressEvent = { type: 'log', jobId, stage: stage as PipelineStage, level, message, timestamp: Date.now() }
  eventBus.publish(evt)
}

async function failJob(jobId: string, error: string) {
  await db.job.update({ where: { id: jobId }, data: { status: 'FAILED', stage: 'FAILED', error, completedAt: new Date() } })
  await log(jobId, 'FAILED', 'ERROR', error)
  eventBus.publish({ type: 'error', jobId, stage: 'FAILED', message: error, timestamp: Date.now() })
  // Free the per-job event history after a short delay (lets late-joiners replay).
  setTimeout(() => eventBus.clear(jobId), 60_000)
}

export { hashText, computeStats }
