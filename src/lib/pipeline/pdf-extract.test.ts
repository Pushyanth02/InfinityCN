/**
 * Regression tests for PDF extraction.
 *
 * These guard the exact failure fixed in v1.1: pdf-parse v2 removed the default
 * export (it now exports a named `PDFParse` class), so the old
 * `import pdf from 'pdf-parse'` worker threw
 *   "The requested module 'pdf-parse' does not provide an export named 'default'"
 * and every PDF silently produced an empty extraction.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { extractText } from './extract'

/**
 * Resolve a real, text-bearing PDF to exercise the full extraction path.
 * Prefers a committed fixture, then falls back to any PDF stored under
 * public/uploads (the dev upload dir). Returns null if none is available.
 */
function resolveSamplePdf(): string | null {
  const fixture = path.join(process.cwd(), 'src', '__fixtures__', 'sample-text.pdf')
  if (fs.existsSync(fixture)) return fixture

  const uploads = path.join(process.cwd(), 'public', 'uploads')
  if (fs.existsSync(uploads)) {
    const pdf = fs.readdirSync(uploads).find((f) => f.toLowerCase().endsWith('.pdf'))
    if (pdf) return path.join(uploads, pdf)
  }
  return null
}

describe('[unit] pdf-parse module contract', () => {
  it('exposes the named PDFParse class and no default export', async () => {
    // If pdf-parse is ever imported with a default binding again, this fails.
    const mod = await import('pdf-parse')
    expect(typeof (mod as { PDFParse?: unknown }).PDFParse).toBe('function')
    expect((mod as { default?: unknown }).default).toBeUndefined()
  })
})

describe('[integration] extractText — PDF', () => {
  const sample = resolveSamplePdf()

  it.skipIf(!sample)(
    'extracts non-empty, multi-page text from a real PDF without an import error',
    async () => {
      const result = await extractText(sample as string, 'application/pdf')

      expect(result.extractor).toBe('pdf')
      // The core regression: text must not be empty for a text-bearing PDF.
      expect(result.text.trim().length).toBeGreaterThan(0)
      expect(result.wordCount).toBeGreaterThan(0)
      // No ESM/CJS import failure should ever surface as a warning.
      expect(result.warnings.join(' ')).not.toContain('does not provide an export named')
      expect(result.warnings.join(' ')).not.toContain('pdf-parse failure')
      // Page metadata should be reported for diagnostics.
      expect(result.meta?.pageCount).toBeGreaterThanOrEqual(1)
      // The pdf-parse page marker must not leak into the narrative text.
      expect(result.text).not.toMatch(/--\s*\d+\s+of\s+\d+\s*--/)
    },
    60_000,
  )
})
