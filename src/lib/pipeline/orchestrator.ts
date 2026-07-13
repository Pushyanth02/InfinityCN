/**
 * Lemniscate — Pipeline Orchestrator (v2)
 * ----------------------------------------------------------------------------
 * Ties together: extraction → canonical model → document intelligence →
 * original/cinematified transforms → persistence.
 *
 * v2 changes:
 *   - All DB writes delegated to PersistenceService (single responsibility).
 *   - CanonicalDocument is the explicit contract between stages.
 *   - Document type detection feeds the pipeline for future domain routing.
 *   - The orchestrator is a pure coordinator — no inline persistence logic.
 *
 * Emits ProgressEvents via the EventBus so the worker + websocket service
 * can stream live progress to the UI.
 *
 * Deterministic, offline, no AI.
 */

import { db } from '../db'
import { transformOriginal, type OriginalResult } from './original'
import { detectDocumentMetadata } from './metadata'
import { eventBus } from '../events/bus'
import type { ProgressEvent, PipelineStage } from '../types'
import { uploadPath } from '../storage'
import { buildCanonicalDocument, type CanonicalDocument } from '../canonical'
import { resolveIntelligenceEngine } from '../intelligence'
import { getDocumentParser } from '../providers'
import {
  persistExtraction,
  persistDocumentMetadata,
  persistDocumentType,
  markDocumentProcessed,
  persistOriginalNarrative,
  persistCinematifiedNarrative,
  resetJobArtifacts,
} from '../services/persistence.service'

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
  documentType: string
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
    // Extraction runs through the pluggable documentParser provider so new
    // formats (EPUB/HTML) or cloud parsers can be swapped in via env config
    // without touching the orchestrator.
    const parser = await getDocumentParser()
    extracted = await parser.parse({ filePath, mimeType: doc.mimeType, originalName: doc.originalName })
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

  await throwIfJobCancelled(jobId)

  // Delegate persistence to the service layer
  await persistExtraction(documentId, extracted)
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
  const filenameBase = doc.originalName.replace(/\.[^.]+$/, '')
  const baseOriginal = transformOriginal(extracted.text, filenameBase)
  await throwIfJobCancelled(jobId)

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

  // ---- 2c. Build CanonicalDocument (the single contract) ----------------
  const canonical: CanonicalDocument = buildCanonicalDocument({
    documentId,
    originalName: doc.originalName,
    mimeType: doc.mimeType,
    extracted,
    originalResult: baseOriginal,
    metadata,
  })

  // Persist the detected document type
  await persistDocumentType(documentId, canonical.documentType)
  await log(
    jobId,
    'SEGMENT',
    'DEBUG',
    `CanonicalDocument built: ${canonical.paragraphs.length} paragraphs, source=${canonical.sourceFormat}, type=${canonical.documentType}.`,
    { sourceFormat: canonical.sourceFormat, documentType: canonical.documentType, paragraphCount: canonical.paragraphs.length },
  )

  // Idempotency: clear any narratives from a previous (failed) attempt of this
  // job so a retry doesn't create duplicates. Cascade removes all child rows.
  // No-op on the first attempt.
  const clearedArtifacts = await resetJobArtifacts(jobId)
  if (clearedArtifacts > 0) {
    await log(jobId, 'SEGMENT', 'WARN', `Cleared ${clearedArtifacts} narrative artifact(s) from a previous attempt (idempotent retry).`, { clearedArtifacts })
  }

  // ---- 3. Original mode -------------------------------------------------
  const narrativeIds: string[] = []
  let sceneCount = 0
  let characterCount = 0

  const runOriginal = mode === 'ORIGINAL' || mode === 'BOTH'
  const runCinema = mode === 'CINEMATIFIED' || mode === 'BOTH'

  if (runOriginal) {
    await setJobStage(jobId, 'ORIGINAL', 35, 'Reconstructing paragraphs (ORIGINAL MODE)…')
    const original = retitleOriginal(baseOriginal, metadata.title)
    await throwIfJobCancelled(jobId)
    await log(jobId, 'ORIGINAL', 'INFO', `Reconstructed ${original.paragraphs.length} paragraphs.`, { transforms: original.transforms })
    // Persist via service
    const nid = await persistOriginalNarrative(jobId, documentId, original)
    narrativeIds.push(nid)
    await setJobStage(jobId, 'ORIGINAL', 55, `Original narrative ready (${original.paragraphs.length} paragraphs).`)
  }

  // ---- 4. Cinematified mode (Document Intelligence Engine) ---------------
  if (runCinema) {
    await setJobStage(jobId, 'CINEMATIFY', 65, 'Detecting scenes, characters, and locations (CINEMATIFIED MODE)…')
    // Resolve the intelligence engine for this document's detected domain.
    // Today the NovelIntelligenceEngine handles every documentType; specialized
    // engines can be registered without changing the orchestrator.
    const engine = resolveIntelligenceEngine(canonical.documentType)
    const cinema = engine.analyze({ canonical, paragraphs: baseOriginal.paragraphs })
    await throwIfJobCancelled(jobId)
    sceneCount = cinema.sceneCount
    characterCount = cinema.characters.length
    await log(jobId, 'CINEMATIFY', 'INFO', `${cinema.sceneCount} scenes, ${cinema.characters.length} characters, ${cinema.locations.length} locations, ${cinema.events.length} events.`, { transforms: cinema.transforms, engine: engine.name, documentType: canonical.documentType })
    await setJobStage(jobId, 'ANALYZE', 80, `Detected ${cinema.sceneCount} scenes & ${cinema.characters.length} characters. Building narrative…`)
    // Persist via service with CanonicalDocument for document type metadata
    const nid = await persistCinematifiedNarrative(jobId, documentId, canonical, cinema)
    narrativeIds.push(nid)
  }

  // ---- 5. Finalize ------------------------------------------------------
  await setJobStage(jobId, 'FINALIZE', 95, 'Finalizing narrative artifacts…')
  await markDocumentProcessed(documentId)
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
  setTimeout(() => eventBus.clear(jobId), 60_000)

  return { narrativeIds, sceneCount, characterCount, durationMs, documentType: canonical.documentType }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Apply the detected title to an already-computed ORIGINAL result without
 * re-running the (expensive) paragraph reconstruction.
 */
function retitleOriginal(r: OriginalResult, title: string): OriginalResult {
  if (r.title === title) return r
  const content = r.content.replace(/^#\s+.*$/m, `# ${title.replace(/\$/g, '$$$$')}`)
  return { ...r, title, content }
}

async function setJobStage(jobId: string, stage: PipelineStage, progress: number, message: string) {
  await throwIfJobCancelled(jobId)
  await db.job.update({ where: { id: jobId }, data: { stage, progress, status: 'PROCESSING', startedAt: stage === 'EXTRACT' ? new Date() : undefined } })
  await log(jobId, stage, 'INFO', message)
  const evt: ProgressEvent = { type: 'stage', jobId, stage, progress, message, timestamp: Date.now() }
  eventBus.publish(evt)
  eventBus.publish({ type: 'progress', jobId, progress, timestamp: Date.now() })
  await nextTick()
  const dwell = STAGE_DWELL_MS
  if (dwell > 0) await sleep(dwell)
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Artificial per-stage dwell so UI progress animations don't snap. Only applied
// in development — in production the pipeline runs as fast as possible (the UI
// interpolates progress client-side). Overridable via LEMNISCATE_STAGE_DWELL_MS.
const MAX_STAGE_DWELL_MS = 5_000

function readBoundedMsFromEnv(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? `${fallback}`, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(MAX_STAGE_DWELL_MS, Math.max(0, parsed))
}

const STAGE_DWELL_MS =
  process.env.NODE_ENV === 'production'
    ? readBoundedMsFromEnv(process.env.LEMNISCATE_STAGE_DWELL_MS, 0)
    : readBoundedMsFromEnv(process.env.LEMNISCATE_STAGE_DWELL_MS, 250)

async function log(jobId: string, stage: string, level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, metadata?: Record<string, unknown>) {
  await db.processingLog.create({
    data: { jobId, stage, level, message, metadata: JSON.stringify(metadata ?? {}) },
  })
  const evt: ProgressEvent = { type: 'log', jobId, stage: stage as PipelineStage, level, message, timestamp: Date.now() }
  eventBus.publish(evt)
}

async function failJob(jobId: string, error: string) {
  const job = await db.job.findUnique({ where: { id: jobId }, select: { status: true } })
  if (job?.status === 'CANCELLED') return
  await db.job.update({ where: { id: jobId }, data: { status: 'FAILED', stage: 'FAILED', error, completedAt: new Date() } })
  await log(jobId, 'FAILED', 'ERROR', error)
  eventBus.publish({ type: 'error', jobId, stage: 'FAILED', message: error, timestamp: Date.now() })
  setTimeout(() => eventBus.clear(jobId), 60_000)
}

async function throwIfJobCancelled(jobId: string): Promise<void> {
  const job = await db.job.findUnique({ where: { id: jobId }, select: { status: true } })
  if (job?.status === 'CANCELLED') {
    eventBus.publish({
      type: 'error',
      jobId,
      stage: 'CANCELLED',
      message: 'Job cancelled by user.',
      timestamp: Date.now(),
    })
    setTimeout(() => eventBus.clear(jobId), 60_000)
    throw new Error('Job cancelled by user')
  }
}
