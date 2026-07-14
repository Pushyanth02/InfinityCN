/**
 * PDF Text Extraction Worker (standalone, runs as child process)
 *
 * Usage: node|bun pdf-extract-worker.mjs <filePath>
 * Output: single JSON line on stdout:
 *   { text, warnings, meta: { pageCount, extractedPages } }
 *
 * Isolated from the Next.js process because pdfjs-dist (used by pdf-parse v2)
 * can segfault on certain PDFs. A crash here kills only this child, not the
 * server. The parent (extract.ts) reads the last stdout line as JSON.
 *
 * pdf-parse v2 API: the package is ESM/CJS dual and exports a *named*
 * `PDFParse` class (there is NO default export — importing `default` throws
 * "does not provide an export named 'default'"). Instantiate the class with
 * `{ data: <buffer> }` and call `getText()`, always calling `destroy()` to
 * release pdfjs worker resources.
 */
import { PDFParse } from 'pdf-parse'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const inputPath = process.argv[2]
if (!inputPath) {
  process.stdout.write(JSON.stringify({ text: '', warnings: ['No file path provided'] }) + '\n')
  process.exit(0)
}

/**
 * Confine an untrusted argv path to a fixed set of approved directories.
 *
 * The parent process (extract.ts) is the primary gatekeeper — it builds paths
 * from sanitized storage names via `uploadPath()`. This worker independently
 * re-validates its argv so a crafted value can never read files outside the
 * approved roots, even if invoked directly.
 *
 * The validation makes NO security decision based on the raw, unnormalized
 * input. Instead it:
 *   1. Rejects obvious traversal/NUL payloads on the raw string up front.
 *   2. Canonicalizes with `path.resolve` (collapsing any `.`/`..` and
 *      producing an absolute path) BEFORE any comparison.
 *   3. Confines the canonical path to an allow-list of roots using
 *      `path.relative`, which is robust against Windows drive jumps and
 *      alternate path forms a naive `startsWith` check would miss.
 *
 * Approved roots:
 *   1. process.cwd()  — dev uploads (public/uploads) and committed fixtures
 *   2. UPLOAD_DIR     — the configured production upload directory
 *   3. os.tmpdir()    — transient/scratch paths
 *
 * Returns the canonical absolute path if safe, otherwise `null`.
 */
function resolveSafeInputPath(rawPath) {
  // (1) Reject malformed or dangerous raw values before any path work.
  if (
    typeof rawPath !== 'string' ||
    rawPath.length === 0 ||
    rawPath.length > 4096 ||
    rawPath.includes('\0')
  ) {
    return null
  }

  // (2) Canonicalize and resolve symlinks so containment checks can't be
  // bypassed via symlink traversal.
  const absolute = path.resolve(rawPath)
  if (path.extname(absolute).toLowerCase() !== '.pdf') return null
  let canonical
  try {
    canonical = fs.realpathSync.native(absolute)
  } catch {
    return null
  }

  // (3) Confine the canonical path to an approved root.
  const projectRoot = path.resolve(process.cwd())
  const defaultUploadRoot = path.resolve(projectRoot, 'public', 'uploads')
  const fixtureRoot = path.resolve(projectRoot, 'src', '__fixtures__')
  const configuredUploadRoot =
    process.env.UPLOAD_DIR && process.env.UPLOAD_DIR.trim()
      ? path.resolve(process.env.UPLOAD_DIR.trim())
      : null

  const allowedRoots = [
    defaultUploadRoot,
    fixtureRoot,
    ...(configuredUploadRoot ? [configuredUploadRoot] : []),
    path.resolve(os.tmpdir()),
  ]
  const withinAllowedRoot = allowedRoots.some((root) => {
    const rel = path.relative(root, canonical)
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
  })

  return withinAllowedRoot ? canonical : null
}

const filePath = resolveSafeInputPath(inputPath)
if (!filePath) {
  process.stdout.write(
    JSON.stringify({ text: '', warnings: ['Invalid file path: outside allowed directory'] }) + '\n',
  )
  process.exit(0)
}

/** @type {import('pdf-parse').PDFParse | undefined} */
let parser
try {
  const dataBuffer = fs.readFileSync(filePath)
  // Pass a fresh Uint8Array view: pdfjs takes ownership of the backing buffer,
  // so we avoid handing it the Node Buffer's shared pool memory.
  const data = new Uint8Array(dataBuffer)
  parser = new PDFParse({ data })

  // `pageJoiner: '\n\n'` overrides the default '-- page_number of total_number --'
  // marker so page boundaries become a clean paragraph break rather than
  // artificial text that would leak into the reconstructed narrative.
  const result = await parser.getText({ pageJoiner: '\n\n' })
  const text = (result?.text ?? '').trim()
  const pageCount = typeof result?.total === 'number' ? result.total : (result?.pages?.length ?? 0)
  const extractedPages = Array.isArray(result?.pages)
    ? result.pages.filter((p) => (p?.text ?? '').trim().length > 0).length
    : 0

  // Surface the embedded PDF Info dictionary (Title/Author/Subject/Keywords)
  // for deterministic title detection. pdf-parse exposes it via getInfo();
  // fall back to any info attached to the text result. Never fatal.
  let embedded
  try {
    let info
    if (typeof parser.getInfo === 'function') {
      const meta = await parser.getInfo()
      info = meta?.info ?? meta
    }
    if (!info && result?.info) info = result.info
    if (info && typeof info === 'object') {
      const pick = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
      embedded = {
        title: pick(info.Title),
        author: pick(info.Author),
        subject: pick(info.Subject),
        keywords: pick(info.Keywords),
      }
      if (!embedded.title && !embedded.author && !embedded.subject && !embedded.keywords) {
        embedded = undefined
      }
    }
  } catch {
    /* embedded metadata is best-effort; ignore failures */
  }

  const warnings = []
  if (!text) {
    warnings.push(
      pageCount > 0
        ? `PDF has ${pageCount} page(s) but no extractable text layer (likely scanned/image-only; OCR is not supported).`
        : 'PDF contained no extractable text.',
    )
  }

  process.stdout.write(
    JSON.stringify({ text, warnings, meta: { pageCount, extractedPages }, embedded }) + '\n',
  )
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  process.stdout.write(
    JSON.stringify({ text: '', warnings: [`pdf-parse failure: ${message}`] }) + '\n',
  )
} finally {
  if (parser) {
    try {
      await parser.destroy()
    } catch {
      /* ignore cleanup errors */
    }
  }
}
process.exit(0)
