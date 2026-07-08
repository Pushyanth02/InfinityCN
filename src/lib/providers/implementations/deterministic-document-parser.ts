/**
 * Lemniscate — Deterministic Document Parser Provider
 * ----------------------------------------------------------------------------
 * Wraps the existing `pipeline/extract.ts` module behind the
 * `IDocumentParser` interface.
 */

import { extractText } from '@/lib/pipeline/extract'
import type { IDocumentParser, ParserInput, ParserOutput } from '../types'

export class DeterministicDocumentParser implements IDocumentParser {
  readonly name = 'deterministic'

  async parse(input: ParserInput): Promise<ParserOutput> {
    const result = await extractText(input.filePath, input.mimeType)

    return {
      text: result.text,
      charCount: result.charCount,
      wordCount: result.wordCount,
      lineCount: result.lineCount,
      language: result.language,
      encoding: result.encoding,
      extractor: result.extractor,
      warnings: result.warnings,
      meta: result.meta,
      embedded: result.embedded,
    }
  }
}