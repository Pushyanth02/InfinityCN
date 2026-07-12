/**
 * Lemniscate — Canonical Document Model (barrel export)
 * ----------------------------------------------------------------------------
 * Re-exports all canonical types and the builder for convenient imports.
 */

export type {
  CanonicalDocument,
  CanonicalParagraph,
  CanonicalParagraphType,
  CanonicalMetadata,
  CanonicalChapter,
  CanonicalEmbeddedMeta,
  TitleSource,
  SourceFormat,
  TextStats,
  ExtractionDiagnostics,
  ExtractionMeta,
  LanguageCode,
} from './types'

export { createCanonicalDocument } from './types'
export { buildCanonicalDocument, type BuildCanonicalInput } from './builder'
export { detectDocumentType } from './detect-type'
