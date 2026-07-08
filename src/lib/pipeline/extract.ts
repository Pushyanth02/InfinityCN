/**
 * Lemniscate — Text Extraction
 * ----------------------------------------------------------------------------
 * Deterministic extraction of plain text from PDF / DOCX / TXT files.
 * No AI, no OCR models — only parsing libraries (pdf-parse, mammoth).
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { EmbeddedMetadata } from './metadata'

const execFileAsync = promisify(execFile)

export interface ExtractedText {
  text: string
  charCount: number
  wordCount: number
  lineCount: number
  language: string
  encoding: string
  extractor: 'pdf' | 'docx' | 'txt' | 'unknown'
  warnings: string[]
  /** Optional per-extractor diagnostics (e.g. PDF page counts). */
  meta?: ExtractMeta
  /** Embedded document metadata (PDF Info dict / DOCX core.xml), if present. */
  embedded?: EmbeddedMetadata
}

export interface ExtractMeta {
  pageCount?: number
  extractedPages?: number
}

/** Shape of the JSON line emitted by pdf-extract-worker.mjs. */
interface PdfWorkerResult {
  text: string
  warnings?: string[]
  meta?: ExtractMeta
  embedded?: EmbeddedMetadata
}

export async function extractText(filePath: string, mimeType: string): Promise<ExtractedText> {
  const warnings: string[] = []
  const ext = path.extname(filePath).toLowerCase()
  let text = ''
  let extractor: ExtractedText['extractor'] = 'unknown'
  let meta: ExtractMeta | undefined
  let embedded: EmbeddedMetadata | undefined

  try {
    if (mimeType === 'application/pdf' || ext === '.pdf') {
      extractor = 'pdf'
      const pdf = await extractPdf(filePath, warnings)
      text = pdf.text
      meta = pdf.meta
      embedded = pdf.embedded
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword' ||
      ext === '.docx' ||
      ext === '.doc'
    ) {
      extractor = 'docx'
      text = await extractDocx(filePath, warnings)
      embedded = await extractDocxCoreProps(filePath)
    } else if (
      mimeType === 'text/plain' ||
      mimeType === 'text/markdown' ||
      ext === '.txt' ||
      ext === '.md'
    ) {
      extractor = 'txt'
      text = await extractTxt(filePath, warnings)
    } else {
      // fall back to plain-text read
      extractor = 'txt'
      text = await extractTxt(filePath, warnings)
      warnings.push(`Unknown mime type "${mimeType}", treated as plain text.`)
    }
  } catch (err) {
    warnings.push(`Extraction error: ${(err as Error).message}`)
  }

  const charCount = text.length
  const wordCount = (text.match(/[A-Za-z0-9'’-]+/g) || []).length
  const lineCount = text.split(/\r?\n/).length
  const language = detectLanguage(text)

  return { text, charCount, wordCount, lineCount, language, encoding: 'utf-8', extractor, warnings, meta, embedded }
}

async function extractPdf(
  filePath: string,
  warnings: string[],
): Promise<{ text: string; meta?: ExtractMeta; embedded?: EmbeddedMetadata }> {
  // PDF extraction runs in an isolated child process because pdfjs-dist
  // (used by pdf-parse v2) can segfault on certain PDFs, killing the host
  // Node.js process. The child is a standalone .mjs script; if it crashes,
  // only the child dies and the Next.js server survives.
  //
  // Runtime-agnostic: use the current Node/Bun executable so this works in
  // both `bun run dev` and `node server.js` production deployments.
  //
  // The worker is located at `src/lib/pipeline/pdf-extract-worker.mjs`
  // relative to the project root. In Next.js standalone mode the Dockerfile
  // explicitly copies it to the same relative path, so `process.cwd()` still
  // resolves correctly. We verify existence here and surface a clear error
  // rather than a confusing ENOENT from execFile if the path ever drifts.
  const workerPath = path.join(process.cwd(), 'src', 'lib', 'pipeline', 'pdf-extract-worker.mjs')

  try {
    await fs.access(workerPath)
  } catch {
    warnings.push(
      `PDF worker not found at ${workerPath}. ` +
      `Ensure pdf-extract-worker.mjs is present relative to the server working directory.`,
    )
    return { text: '' }
  }

  const runner = process.execPath || (process.versions.bun ? 'bun' : 'node')
  try {
    const { stdout } = await execFileAsync(runner, [workerPath, filePath], {
      timeout: 30_000,
      maxBuffer: 50 * 1024 * 1024,
      cwd: process.cwd(),
    })
    const lastLine = stdout.trim().split('\n').pop() || '{}'
    const result = JSON.parse(lastLine) as PdfWorkerResult
    if (result.warnings) warnings.push(...result.warnings)
    const raw = (result.text || '').trim()
    if (!raw) return { text: '', meta: result.meta, embedded: result.embedded }
    const text = raw
      .replace(/\r\n?/g, '\n')
      // Strip any residual pdf-parse page markers ("-- 3 of 9 --") defensively,
      // in case an older worker build or option set re-introduces them.
      .replace(/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/gim, '')
      .replace(/([.!?])\s*\n/g, '$1\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    return { text, meta: result.meta, embedded: result.embedded }
  } catch (err) {
    // If the child crashed (segfault), err.killed or err.signal will be set.
    const e = err as NodeJS.ErrnoException & { killed?: boolean; signal?: string }
    const msg = e.killed
      ? `PDF extraction timed out (30s)`
      : e.signal
        ? `PDF extraction crashed (signal: ${e.signal})`
        : `pdf-parse failure: ${e.message}`
    warnings.push(msg)
    return { text: '' }
  }
}

async function extractDocx(filePath: string, warnings: string[]): Promise<string> {
  const mammoth = await import('mammoth')
  try {
    const result = await mammoth.extractRawText({ path: filePath })
    if (!result.value || result.value.trim().length === 0) {
      warnings.push('DOCX extraction yielded no text.')
    }
    if (result.messages && result.messages.length) {
      for (const m of result.messages.slice(0, 5)) {
        warnings.push(`mammoth: ${m.type} — ${m.message}`)
      }
    }
    return result.value || ''
  } catch (err) {
    warnings.push(`mammoth failure: ${(err as Error).message}`)
    return ''
  }
}

/**
 * Read a DOCX file's embedded core properties (docProps/core.xml) — Title,
 * Author (dc:creator), and Subject. A .docx is an OOXML ZIP; we parse the ZIP
 * central directory and inflate only the single core.xml entry. Fully
 * deterministic, dependency-free, and best-effort (never throws).
 */
export async function extractDocxCoreProps(filePath: string): Promise<EmbeddedMetadata | undefined> {
  try {
    const buf = await fs.readFile(filePath)
    const xml = readZipEntryText(buf, 'docProps/core.xml')
    if (!xml) return undefined
    const pick = (tag: string): string | undefined => {
      // Match <dc:title>…</dc:title> and similar, ignoring namespace prefixes.
      const re = new RegExp(`<(?:[\\w]+:)?${tag}[^>]*>([\\s\\S]*?)</(?:[\\w]+:)?${tag}>`, 'i')
      const m = re.exec(xml)
      if (!m) return undefined
      const text = decodeXmlEntities(m[1]).replace(/\s+/g, ' ').trim()
      return text || undefined
    }
    const embedded: EmbeddedMetadata = {
      title: pick('title'),
      author: pick('creator'),
      subject: pick('subject'),
      keywords: pick('keywords'),
    }
    if (!embedded.title && !embedded.author && !embedded.subject && !embedded.keywords) {
      return undefined
    }
    return embedded
  } catch {
    return undefined
  }
}

/** Locate a ZIP entry by name via the central directory and inflate it to UTF-8 text. */
function readZipEntryText(buf: Buffer, entryName: string): string | null {
  // Find End Of Central Directory record (scan backwards for signature).
  const EOCD_SIG = 0x06054b50
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 0x10000; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break }
  }
  if (eocd < 0) return null

  const cdCount = buf.readUInt16LE(eocd + 10)
  let ptr = buf.readUInt32LE(eocd + 16) // central directory offset
  const CD_SIG = 0x02014b50

  for (let i = 0; i < cdCount; i++) {
    if (ptr + 46 > buf.length || buf.readUInt32LE(ptr) !== CD_SIG) break
    const method = buf.readUInt16LE(ptr + 10)
    const compSize = buf.readUInt32LE(ptr + 20)
    const nameLen = buf.readUInt16LE(ptr + 28)
    const extraLen = buf.readUInt16LE(ptr + 30)
    const commentLen = buf.readUInt16LE(ptr + 32)
    const localOffset = buf.readUInt32LE(ptr + 42)
    const name = buf.toString('utf-8', ptr + 46, ptr + 46 + nameLen)

    if (name === entryName) {
      // Jump to the local file header to compute the data start.
      const LOCAL_SIG = 0x04034b50
      if (buf.readUInt32LE(localOffset) !== LOCAL_SIG) return null
      const lNameLen = buf.readUInt16LE(localOffset + 26)
      const lExtraLen = buf.readUInt16LE(localOffset + 28)
      const dataStart = localOffset + 30 + lNameLen + lExtraLen
      const data = buf.subarray(dataStart, dataStart + compSize)
      if (method === 0) return data.toString('utf-8') // stored
      if (method === 8) return zlib.inflateRawSync(data).toString('utf-8') // deflate
      return null
    }
    ptr += 46 + nameLen + extraLen + commentLen
  }
  return null
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
}

async function extractTxt(filePath: string, warnings: string[]): Promise<string> {
  try {
    const buf = await fs.readFile(filePath)
    // detect BOM
    if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
      return buf.subarray(3).toString('utf-8')
    }
    return buf.toString('utf-8')
  } catch (err) {
    warnings.push(`txt read failure: ${(err as Error).message}`)
    return ''
  }
}

/**
 * Trivial language detector — counts ASCII letters vs other scripts and a
 * handful of common English function words. Deterministic, no models.
 */
export function detectLanguage(text: string): string {
  if (!text) return 'unknown'
  const sample = text.slice(0, 4000).toLowerCase()
  const englishHits = [
    /\bthe\b/g, /\band\b/g, /\bof\b/g, /\bto\b/g, /\ba\b/g, /\bin\b/g,
    /\bis\b/g, /\bit\b/g, /\bthat\b/g, /\bwas\b/g,
  ].reduce((acc, re) => acc + (sample.match(re) || []).length, 0)
  const latinChars = (sample.match(/[a-z]/g) || []).length
  const totalChars = sample.replace(/\s/g, '').length || 1
  if (latinChars / totalChars > 0.6 && englishHits > 8) return 'en'
  if (latinChars / totalChars > 0.6) return 'la' // generic latin script
  return 'other'
}

export async function hashFile(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath)
  return createHash('sha256').update(buf).digest('hex')
}

export function hashBuffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

export async function hashText(text: string): Promise<string> {
  return createHash('sha256').update(text).digest('hex')
}
