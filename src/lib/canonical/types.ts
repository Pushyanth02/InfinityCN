/**
 * Lemniscate — Canonical Document Model
 * ----------------------------------------------------------------------------
 * The single normalized internal representation that every parser produces
 * and every downstream engine consumes. This is the architectural keystone:
 *
 *   Upload → Parser → CanonicalDocument → [Metadata, Scenes, Characters,
 *                                            Relationships, Narrative, Reader]
 *
 * No downstream algorithm cares about the original file format (PDF/DOCX/TXT).
 * They all operate on this unified structure. Supporting new formats (EPUB,
 * Markdown, HTML) becomes a matter of adding a new parser that emits a
 * CanonicalDocument — nothing downstream changes.
 */

import type { DocumentType } from '@/lib/domain/enums'

export type SourceFormat = 'pdf' | 'docx' | 'txt' | 'md' | 'unknown'

export type CanonicalParagraphType =
  | 'NARRATION'
  | 'DIALOGUE'
  | 'ACTION'
  | 'TRANSITION'
  | 'HEADING'
  | 'THOUGHT'

export type LanguageCode = string

export interface TextStats {
  charCount: number
  wordCount: number
  lineCount: number
  sentenceCount: number
  readingTimeMin: number
}

export interface CanonicalParagraph {
  index: number
  text: string
  rawText: string
  type: CanonicalParagraphType
  speaker: string | null
  wordCount: number
  charCount: number
  startOffset: number
  endOffset: number
}

export type TitleSource =
  | 'embedded'
  | 'heading'
  | 'typography'
  | 'chapter'
  | 'filename'

export interface CanonicalChapter {
  index: number
  title: string
  offset: number
}

export interface CanonicalEmbeddedMeta {
  title?: string
  author?: string
  subject?: string
  keywords?: string
  creator?: string
}

export interface CanonicalMetadata {
  title: string
  titleSource: TitleSource
  author: string | null
  subtitle: string | null
  series: string | null
  language: LanguageCode
  wordCount: number
  readingTimeMin: number
  chapters: CanonicalChapter[]
  chapterCount: number
  embedded: CanonicalEmbeddedMeta | null
}

export interface ExtractionMeta {
  pageCount?: number
  extractedPages?: number
}

export interface ExtractionDiagnostics {
  extractor: string
  encoding: string
  warnings: string[]
  meta?: ExtractionMeta
}

export interface CanonicalDocument {
  id: string
  originalName: string
  mimeType: string
  sourceFormat: SourceFormat
  /** Domain category — routes Document Intelligence Engine modules. */
  documentType: DocumentType
  rawText: string
  cleanText: string
  paragraphs: CanonicalParagraph[]
  metadata: CanonicalMetadata
  stats: TextStats
  extraction: ExtractionDiagnostics
}

export interface CanonicalDocumentBuildOptions {
  id: string
  originalName: string
  mimeType: string
  sourceFormat: SourceFormat
  documentType: DocumentType
  rawText: string
  cleanText: string
  paragraphs: CanonicalParagraph[]
  metadata: CanonicalMetadata
  stats: TextStats
  extraction: ExtractionDiagnostics
}

export function createCanonicalDocument(
  opts: CanonicalDocumentBuildOptions,
): CanonicalDocument {
  return {
    id: opts.id,
    originalName: opts.originalName,
    mimeType: opts.mimeType,
    sourceFormat: opts.sourceFormat,
    documentType: opts.documentType,
    rawText: opts.rawText,
    cleanText: opts.cleanText,
    paragraphs: opts.paragraphs,
    metadata: opts.metadata,
    stats: opts.stats,
    extraction: opts.extraction,
  }
}