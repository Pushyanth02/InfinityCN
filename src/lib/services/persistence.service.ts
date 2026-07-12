/**
 * Lemniscate — Persistence Service
 * ----------------------------------------------------------------------------
 * Encapsulates all database write operations for the processing pipeline.
 * Extracted from the orchestrator so that:
 *   1. The orchestrator is a pure coordinator (extract → transform → persist).
 *   2. DB writes are testable in isolation.
 *   3. Future checkpoint/resume can snapshot between stages.
 */

import { db } from '@/lib/db'
import { computeStats } from '@/lib/nlp/core'
import type { Prisma } from '@prisma/client'
import type { DocumentType } from '@/lib/domain/enums'
import type { CanonicalDocument } from '@/lib/canonical'
import type { OriginalResult } from '@/lib/pipeline/original'
import type { CinematifiedResult, CinematifiedScene } from '@/lib/pipeline/cinematified'
import type { DetectedMetadata } from '@/lib/pipeline/metadata'

export async function persistExtraction(
  documentId: string,
  extracted: {
    text: string
    charCount: number
    wordCount: number
    lineCount: number
    language: string
    encoding: string
  },
): Promise<void> {
  await db.rawText.upsert({
    where: { documentId },
    create: { documentId, content: extracted.text, charCount: extracted.charCount, wordCount: extracted.wordCount, lineCount: extracted.lineCount, language: extracted.language, encoding: extracted.encoding },
    update: { content: extracted.text, charCount: extracted.charCount, wordCount: extracted.wordCount, lineCount: extracted.lineCount, language: extracted.language, encoding: extracted.encoding },
  })
  await db.document.update({ where: { id: documentId }, data: { status: 'EXTRACTED' } })
}

export async function persistDocumentMetadata(documentId: string, m: DetectedMetadata): Promise<void> {
  await db.document.update({
    where: { id: documentId },
    data: {
      title: m.title, titleSource: m.titleSource, author: m.author, subtitle: m.subtitle,
      series: m.series, language: m.language, wordCount: m.wordCount, readingTimeMin: m.readingTimeMin,
      chapterCount: m.chapterCount, detectedMeta: JSON.stringify({ titleSource: m.titleSource, chapters: m.chapters }),
    },
  })
}

export async function persistDocumentType(documentId: string, documentType: DocumentType): Promise<void> {
  await db.document.update({ where: { id: documentId }, data: { documentType } })
}

export async function markDocumentProcessed(documentId: string): Promise<void> {
  await db.document.update({ where: { id: documentId }, data: { status: 'PROCESSED' } })
}

/**
 * Remove any narratives (and their cascade-deleted children: paragraphs,
 * scenes, characters, locations, events, arcs, peaks, progress, bookmarks)
 * previously written by this job. Makes the pipeline idempotent on retry — a
 * job that failed after partially persisting a narrative won't create
 * duplicates when `executeJobWithRetry` runs it again. On a first attempt this
 * deletes nothing (no-op).
 */
export async function resetJobArtifacts(jobId: string): Promise<number> {
  const { count } = await db.narrative.deleteMany({ where: { jobId } })
  return count
}

export async function persistOriginalNarrative(jobId: string, documentId: string, r: OriginalResult): Promise<string> {
  const stats = r.stats
  // Atomic: narrative + paragraphs commit together or roll back together,
  // so a mid-write failure leaves no orphaned narrative row without children.
  return db.$transaction(async (tx) => {
    const narrative = await tx.narrative.create({
      data: {
        documentId, jobId, mode: 'ORIGINAL', title: r.title, content: r.content, plainText: r.plainText,
        wordCount: stats.wordCount, charCount: stats.charCount, readingTimeMin: stats.readingTimeMin,
        paragraphCount: r.paragraphs.length, sceneCount: 0, metadata: JSON.stringify({ transforms: r.transforms, stats }),
      },
    })
    if (r.paragraphs.length) {
      await tx.paragraph.createMany({
        data: r.paragraphs.map((p) => ({
          narrativeId: narrative.id, index: p.index, text: p.text, type: p.type,
          speaker: p.speaker ?? null, rawText: p.rawText, wordCount: p.wordCount, charCount: p.charCount,
          startOffset: p.startOffset, endOffset: p.endOffset,
        })),
      })
    }
    return narrative.id
  })
}

export async function persistCinematifiedNarrative(
  jobId: string, documentId: string, canonical: CanonicalDocument, r: CinematifiedResult,
): Promise<string> {
  const cinemaStats = computeStats(r.plainText)
  // Atomic: the narrative and all its child rows (paragraphs, scenes,
  // characters, locations, events, arcs, peaks) commit together or roll back
  // together. A failure partway through leaves no orphaned partial narrative.
  return db.$transaction(async (tx) => {
    const narrative = await tx.narrative.create({
      data: {
        documentId, jobId, mode: 'CINEMATIFIED', title: r.title, content: r.content, plainText: r.plainText,
        wordCount: cinemaStats.wordCount, charCount: cinemaStats.charCount, readingTimeMin: cinemaStats.readingTimeMin,
        paragraphCount: r.scenes.reduce((a, s) => a + s.paragraphCount, 0), sceneCount: r.sceneCount,
        metadata: JSON.stringify({
          transforms: r.transforms, arcs: r.arcs.length, peaks: r.peaks.length, events: r.events.length,
          intelligence: r.intelligence, coOccurrence: r.coOccurrence, emotionTimeline: r.emotionTimeline,
          momentumTimeline: r.momentumTimeline, structure: r.structure, documentType: canonical.documentType,
        }),
      },
    })
    await persistParagraphs(tx, narrative.id, r.scenes)
    await persistScenes(tx, narrative.id, r.scenes)
    await persistCharacters(tx, narrative.id, r.characters)
    await persistLocations(tx, narrative.id, r.locations)
    // events & peaks reference scene IDs, so scenes must be persisted first.
    await persistEvents(tx, narrative.id, r.events)
    await persistArcs(tx, narrative.id, r.arcs)
    await persistPeaks(tx, narrative.id, r.peaks)
    return narrative.id
  })
}

async function persistParagraphs(tx: Prisma.TransactionClient, narrativeId: string, scenes: CinematifiedScene[]): Promise<void> {
  const paraRows: Array<{ narrativeId: string; index: number; text: string; type: string; speaker: string | null; rawText: string; wordCount: number; charCount: number; startOffset: number; endOffset: number }> = []
  let pIdx = 0
  for (const scene of scenes) {
    for (const p of scene.paragraphs) {
      paraRows.push({ narrativeId, index: pIdx++, text: p.text, type: p.type, speaker: p.speaker ?? null, rawText: p.rawText, wordCount: p.wordCount, charCount: p.charCount, startOffset: p.startOffset, endOffset: p.endOffset })
    }
  }
  if (paraRows.length) await tx.paragraph.createMany({ data: paraRows })
}

async function persistScenes(tx: Prisma.TransactionClient, narrativeId: string, scenes: CinematifiedScene[]): Promise<void> {
  if (!scenes.length) return
  await tx.scene.createMany({
    data: scenes.map((s) => ({
      narrativeId, index: s.index, title: s.title, summary: s.summary, location: s.location,
      timeOfDay: s.timeOfDay, mood: s.mood, tensionScore: s.tensionScore, emotionScore: s.emotionScore,
      dominantEmotion: s.dominantEmotion, momentumScore: s.momentumScore, arousalScore: s.arousalScore,
      valence: s.valence, structurePhase: s.structurePhase, startOffset: s.startOffset, endOffset: s.endOffset,
      charCount: s.charCount, paragraphCount: s.paragraphCount, dialogueRatio: s.dialogueRatio, eventCount: s.eventCount,
    })),
  })
}

async function persistCharacters(tx: Prisma.TransactionClient, narrativeId: string, characters: CinematifiedResult['characters']): Promise<void> {
  if (!characters.length) return
  await tx.character.createMany({
    data: characters.map((c) => ({
      narrativeId, name: c.name, aliases: JSON.stringify(c.aliases), mentions: c.mentions,
      firstAppearanceOffset: c.firstAppearanceOffset, role: c.role, dialogueLines: c.dialogueLines,
      description: null, importanceScore: c.importanceScore, confidenceScore: c.confidenceScore,
      speakingCount: c.speakingCount, lastAppearanceOffset: c.lastAppearanceOffset,
      metadata: JSON.stringify({ id: c.id, honorifics: c.honorifics, gender: c.gender, scenes: c.scenes }),
    })),
  })
}

async function persistLocations(tx: Prisma.TransactionClient, narrativeId: string, locations: CinematifiedResult['locations']): Promise<void> {
  if (!locations.length) return
  await tx.location.createMany({
    data: locations.map((l) => ({ narrativeId, name: l.name, mentions: l.mentions, type: l.type, firstAppearanceOffset: l.firstAppearanceOffset })),
  })
}

async function persistEvents(tx: Prisma.TransactionClient, narrativeId: string, events: CinematifiedResult['events']): Promise<void> {
  if (!events.length) return
  const sceneRows = await tx.scene.findMany({ where: { narrativeId }, orderBy: { index: 'asc' } })
  await tx.event.createMany({
    data: events.map((e) => ({
      narrativeId, sceneId: sceneRows[e.sceneIndex]?.id ?? null, index: e.index, type: e.type,
      description: e.description, participants: JSON.stringify(e.participants), offset: e.offset, intensity: e.intensity,
    })),
  })
}

async function persistArcs(tx: Prisma.TransactionClient, narrativeId: string, arcs: CinematifiedResult['arcs']): Promise<void> {
  if (!arcs.length) return
  await tx.narrativeArc.createMany({
    data: arcs.map((a) => ({ narrativeId, name: a.name, arcType: a.arcType, startSceneIdx: a.startSceneIdx, endSceneIdx: a.endSceneIdx, intensity: a.intensity, summary: a.summary })),
  })
}

async function persistPeaks(tx: Prisma.TransactionClient, narrativeId: string, peaks: CinematifiedResult['peaks']): Promise<void> {
  if (!peaks.length) return
  const sceneRows = await tx.scene.findMany({ where: { narrativeId }, orderBy: { index: 'asc' } })
  await tx.emotionalPeak.createMany({
    data: peaks.map((p) => ({
      narrativeId, sceneId: p.sceneIndex !== null ? sceneRows[p.sceneIndex]?.id ?? null : null,
      offset: p.offset, intensity: p.intensity, emotion: p.emotion, snippet: p.snippet,
    })),
  })
}