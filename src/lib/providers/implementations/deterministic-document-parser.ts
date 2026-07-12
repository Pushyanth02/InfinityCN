/**
 * Lemniscate — Deterministic Document Parser Provider
 * ----------------------------------------------------------------------------
 * Wraps the existing `pipeline/extract.ts` module behind the `IDocumentParser`
 * interface. Returns the canonical `ExtractedText` contract directly so the
 * result can flow straight into the CanonicalDocument builder.
 */

import { extractText, type ExtractedText } from '@/lib/pipeline/extract'
import type { IDocumentParser, ParserInput } from '../types'

export class DeterministicDocumentParser implements IDocumentParser {
  readonly name = 'deterministic'

  async parse(input: ParserInput): Promise<ExtractedText> {
    return extractText(input.filePath, input.mimeType)
  }
}
