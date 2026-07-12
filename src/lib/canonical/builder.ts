/**
 * Lemniscate — Canonical Document Builder
 * Bridges the existing extraction / paragraph-reconstruction / metadata
 * pipeline stages into the unified CanonicalDocument model.
 */

import type {
  CanonicalDocument,
  CanonicalParagraph,
  CanonicalParagraphType,
  CanonicalMetadata,
  CanonicalChapter,
  CanonicalEmbeddedMeta,
  SourceFormat,
  TextStats,
  ExtractionDiagnostics,
} from './types'
import type { ExtractedText } from '@/lib/pipeline/extract'
import type { OriginalParagraph, OriginalResult } from '@/lib/pipeline/original'
import type { DetectedMetadata } from '@/lib/pipeline/metadata'
import type { DocumentType } from '@/lib/domain/enums'
import { detectDocumentType } from './detect-type'

export interface BuildCanonicalInput {
  documentId: string
  originalName: string
  mimeType: string
  extracted: ExtractedText
  originalResult: OriginalResult
  metadata: DetectedMetadata
  /** Override document type detection (skip heuristic). */
  documentType?: DocumentType
}

export function buildCanonicalDocument(input: BuildCanonicalInput): CanonicalDocument {
  const { documentId, originalName, mimeType, extracted, originalResult, metadata } = input

  // Detect the document type (or use override from caller)
  const documentType: DocumentType =
    input.documentType ??
    detectDocumentType(
      extracted.text,
      originalResult.paragraphs.map((p: OriginalParagraph) => ({
        index: p.index,
        text: p.text,
        rawText: p.rawText,
        type: p.type,
        speaker: p.speaker ?? null,
        wordCount: p.wordCount,
        charCount: p.charCount,
        startOffset: p.startOffset,
        endOffset: p.endOffset,
      })),
    )

  const sourceFormat: SourceFormat = (() => {
    switch (extracted.extractor) {
      case 'pdf': return 'pdf'
      case 'docx': return 'docx'
      case 'txt': return 'txt'
      default: return 'unknown'
    }
  })()

  const paragraphs: CanonicalParagraph[] = originalResult.paragraphs.map((p: OriginalParagraph) => ({
    index: p.index,
    text: p.text,
    rawText: p.rawText,
    type: p.type as CanonicalParagraphType,
    speaker: p.speaker ?? null,
    wordCount: p.wordCount,
    charCount: p.charCount,
    startOffset: p.startOffset,
    endOffset: p.endOffset,
  }))

  const chapters: CanonicalChapter[] = metadata.chapters.map((c: { index: number; title: string; offset: number }) => ({
    index: c.index,
    title: c.title,
    offset: c.offset,
  }))

  const canonicalEmbedded: CanonicalEmbeddedMeta | null = extracted.embedded
    ? {
        title: extracted.embedded.title,
        author: extracted.embedded.author,
        subject: extracted.embedded.subject,
        keywords: extracted.embedded.keywords,
      }
    : null

  const canonicalMeta: CanonicalMetadata = {
    title: metadata.title,
    titleSource: metadata.titleSource,
    author: metadata.author,
    subtitle: metadata.subtitle,
    series: metadata.series,
    language: metadata.language,
    wordCount: metadata.wordCount,
    readingTimeMin: metadata.readingTimeMin,
    chapters,
    chapterCount: metadata.chapterCount,
    embedded: canonicalEmbedded,
  }

  const stats: TextStats = {
    charCount: originalResult.stats.charCount,
    wordCount: originalResult.stats.wordCount,
    lineCount: extracted.lineCount,
    sentenceCount: (originalResult.stats as { sentenceCount?: number }).sentenceCount ?? 0,
    readingTimeMin: originalResult.stats.readingTimeMin,
  }

  const extraction: ExtractionDiagnostics = {
    extractor: extracted.extractor,
    encoding: extracted.encoding,
    warnings: extracted.warnings,
    meta: extracted.meta,
  }

  return {
    id: documentId,
    originalName,
    mimeType,
    sourceFormat,
    documentType,
    rawText: extracted.text,
    cleanText: originalResult.plainText,
    paragraphs,
    metadata: canonicalMeta,
    stats,
    extraction,
  }
}
