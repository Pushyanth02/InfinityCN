/**
 * Lemniscate — Export Service
 * ----------------------------------------------------------------------------
 * Exports narratives in multiple formats: Markdown, HTML (full page),
 * PDF (print-ready HTML opened via browser print), EPUB (real stored-zip),
 * and JSON (full data export).
 *
 * The format generators were promoted here from the legacy export route so
 * both the unversioned `/api/narratives/[id]/export` and the versioned
 * `/api/v1/narratives/[id]/export` surfaces share one implementation.
 *
 * All generation is deterministic and source-verbatim — no content is invented.
 */

import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { NotFoundError } from '@/lib/domain/errors'

// ─── Types ────────────────────────────────────────────────────────────────

export type ExportFormat = 'markdown' | 'html' | 'pdf' | 'epub' | 'json'

export interface ExportResult {
  format: ExportFormat
  mimeType: string
  filename: string
  sizeBytes: number
  /** For text formats this is a string; for binary formats (epub) a Buffer. */
  body: string | Uint8Array
}

/**
 * The exact shape returned by the export query below. Derived from Prisma so it
 * stays in sync with the schema and relation includes automatically.
 */
type NarrativeExport = Prisma.NarrativeGetPayload<{
  include: {
    scenes: { include: { events: true } }
    characters: true
    locations: true
    arcs: true
    peaks: true
  }
}>

// ─── Service methods ──────────────────────────────────────────────────────

/**
 * Export a narrative in the requested format.
 */
export async function exportNarrative(
  narrativeId: string,
  format: ExportFormat,
): Promise<ExportResult> {
  const narrative = await db.narrative.findUnique({
    where: { id: narrativeId },
    include: {
      scenes: { orderBy: { index: 'asc' }, include: { events: true } },
      characters: { orderBy: { mentions: 'desc' } },
      locations: { orderBy: { mentions: 'desc' } },
      arcs: { orderBy: { startSceneIdx: 'asc' } },
      peaks: { orderBy: { intensity: 'desc' }, take: 20 },
    },
  })

  if (!narrative) throw new NotFoundError(`Narrative '${narrativeId}' not found`)

  const baseFilename = slug(narrative.title)

  switch (format) {
    case 'markdown':
      return exportMarkdown(narrative, baseFilename)
    case 'html':
      return exportHtml(narrative, baseFilename)
    case 'pdf':
      return exportPdf(narrative, baseFilename)
    case 'epub':
      return exportEpub(narrative, baseFilename)
    case 'json':
      return exportJson(narrative, baseFilename)
    default:
      throw new Error(`Unsupported export format: ${format}`)
  }
}

// ─── Filename helper ──────────────────────────────────────────────────────

function slug(title: string): string {
  const cleaned = title.replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/^-+|-+$/g, '').slice(0, 80)
  return cleaned || 'narrative'
}

// ─── Format implementations ───────────────────────────────────────────────

function exportMarkdown(n: NarrativeExport, baseFilename: string): ExportResult {
  const lines: string[] = []
  lines.push(`# ${n.title}`, '')
  lines.push(`> *${n.mode === 'CINEMATIFIED' ? 'Cinematified reconstruction' : 'Original reconstruction'} · ${n.wordCount.toLocaleString()} words · ${n.readingTimeMin} min read*`, '')
  lines.push(`---`, '')

  if (n.mode === 'CINEMATIFIED' && n.scenes?.length) {
    // Arc map
    if (n.arcs?.length) {
      lines.push(`## Narrative Arc Map`, '')
      for (const a of n.arcs) {
        lines.push(`- **${a.arcType}** (Scenes ${a.startSceneIdx + 1}–${a.endSceneIdx + 1}, ${a.intensity}% intensity): ${a.summary}`)
      }
      lines.push('')
    }

    // Scenes
    for (const scene of n.scenes) {
      lines.push(`## Scene ${scene.index + 1}: ${scene.location || 'Unknown'}`, '')
      lines.push(`*${scene.title || ''} · Mood: ${scene.mood || '—'} · Tension: ${scene.tensionScore}%*`, '')
      if (scene.summary) lines.push(`> ${scene.summary}`, '')
      lines.push('')
      if (scene.events?.length) {
        lines.push(`**Events:**`)
        for (const e of scene.events) {
          lines.push(`- [${e.type}] ${e.description}`)
        }
        lines.push('')
      }
      lines.push(`---`, '')
    }
  } else {
    // Original mode — use the pre-rendered content
    lines.push(n.content || n.plainText || '')
  }

  // Characters appendix
  if (n.characters?.length) {
    lines.push(`## Characters`, '')
    lines.push(`| Name | Role | Mentions | Dialogue |`, `| --- | --- | --- | --- |`)
    for (const c of n.characters) {
      lines.push(`| ${c.name} | ${c.role} | ${c.mentions} | ${c.dialogueLines} |`)
    }
    lines.push('')
  }

  // Emotional peaks
  if (n.peaks?.length) {
    lines.push(`## Emotional Peaks`, '')
    for (const p of n.peaks.slice(0, 10)) {
      lines.push(`- **${p.emotion}** (${p.intensity}%): "${p.snippet}"`)
    }
  }

  const content = lines.join('\n')
  return {
    format: 'markdown',
    mimeType: 'text/markdown',
    filename: `${baseFilename}.md`,
    sizeBytes: Buffer.byteLength(content, 'utf-8'),
    body: content,
  }
}

function exportHtml(n: NarrativeExport, baseFilename: string): ExportResult {
  const esc = (s: string) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  const sceneList = (n.scenes || [])
    .map((s) => `<li><strong>${esc(s.title)}</strong> — ${esc(s.summary || '')}</li>`)
    .join('\n')

  const charList = (n.characters || [])
    .slice(0, 20)
    .map((c) => `<li>${esc(c.name)} (${esc(c.role)}, ${c.mentions} mentions)</li>`)
    .join('\n')

  // Convert simple markdown to HTML (headings, paragraphs, bold)
  const bodyHtml = (n.content || '')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p>\n<p>')
    .replace(/\n/g, '<br>')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(n.title)}</title>
<style>
  body { font-family: Georgia, serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; }
  h1 { font-size: 2rem; }
  .metadata { color: #666; font-size: 0.9rem; margin-bottom: 2rem; }
  .scene-list, .char-list { margin: 1rem 0; padding-left: 1.5rem; }
  @media print { body { max-width: none; margin: 0; } }
</style>
</head>
<body>
<h1>${esc(n.title)}</h1>
<div class="metadata">
  <p>${n.wordCount} words · ${n.readingTimeMin} min read · ${n.sceneCount} scenes</p>
</div>
${sceneList ? `<h2>Scenes</h2><ul class="scene-list">${sceneList}</ul>` : ''}
${charList ? `<h2>Characters</h2><ul class="char-list">${charList}</ul>` : ''}
<hr>
<p>${bodyHtml}</p>
</body>
</html>`

  return {
    format: 'html',
    mimeType: 'text/html',
    filename: `${baseFilename}.html`,
    sizeBytes: Buffer.byteLength(html, 'utf-8'),
    body: html,
  }
}

/** PDF is delivered as print-ready HTML (opened via browser print to PDF). */
function exportPdf(n: NarrativeExport, baseFilename: string): ExportResult {
  const html = generatePrintableHTML(n)
  return {
    format: 'pdf',
    mimeType: 'text/html',
    filename: `${baseFilename}.html`,
    sizeBytes: Buffer.byteLength(html, 'utf-8'),
    body: html,
  }
}

function exportEpub(n: NarrativeExport, baseFilename: string): ExportResult {
  // EPUB is a zip of XHTML files. We generate a minimal valid EPUB 2 structure
  // using an uncompressed (stored) zip — no external zip library required, and
  // all major e-readers accept stored zips.
  const epub = generateEPUB(n)
  return {
    format: 'epub',
    mimeType: 'application/epub+zip',
    filename: `${baseFilename}.epub`,
    sizeBytes: epub.byteLength,
    body: epub,
  }
}

function exportJson(n: NarrativeExport, baseFilename: string): ExportResult {
  const content = JSON.stringify(
    {
      narrative: {
        id: n.id,
        title: n.title,
        mode: n.mode,
        wordCount: n.wordCount,
        charCount: n.charCount,
        readingTimeMin: n.readingTimeMin,
        sceneCount: n.sceneCount,
        paragraphCount: n.paragraphCount,
        metadata: n.metadata ? JSON.parse(n.metadata) : {},
        createdAt: n.createdAt,
      },
      scenes: n.scenes,
      characters: n.characters,
      locations: n.locations,
      arcs: n.arcs,
      peaks: n.peaks,
    },
    null,
    2,
  )

  return {
    format: 'json',
    mimeType: 'application/json',
    filename: `${baseFilename}.json`,
    sizeBytes: Buffer.byteLength(content, 'utf-8'),
    body: content,
  }
}

// ─── Generators ───────────────────────────────────────────────────────────

/** Printable HTML — opens as a PDF via the browser's print-to-PDF dialog. */
function generatePrintableHTML(n: NarrativeExport): string {
  const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const body = n.mode === 'CINEMATIFIED'
    ? (n.scenes || []).map((s) => `
        <div class="scene">
          <h2>Scene ${s.index + 1}</h2>
          <p class="heading">${escapeHtml(s.title || '')}</p>
          <p class="meta">Mood: ${s.mood || '—'} · Tension: ${s.tensionScore}%</p>
          ${s.summary ? `<blockquote>${escapeHtml(s.summary)}</blockquote>` : ''}
        </div>`).join('')
    : `<div class="original-content">${escapeHtml(n.content || n.plainText || '')}</div>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(n.title)}</title>
<style>
  @page { margin: 2cm; }
  body { font-family: Georgia, 'Times New Roman', serif; line-height: 1.8; color: #1a1a2e; max-width: 38rem; margin: 0 auto; padding: 2rem; }
  h1 { font-size: 2rem; margin-bottom: 0.5rem; }
  h2 { font-size: 1.3rem; color: #8a6d2b; margin-top: 2rem; border-bottom: 1px solid #ddd; padding-bottom: 0.3rem; }
  .heading { font-family: monospace; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em; color: #8a6d2b; }
  .meta { font-size: 0.85rem; color: #666; }
  blockquote { border-left: 3px solid #8a6d2b; padding-left: 1rem; font-style: italic; color: #555; }
  .scene { margin-bottom: 2rem; page-break-inside: avoid; }
  .subtitle { color: #666; font-style: italic; margin-bottom: 2rem; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>${escapeHtml(n.title)}</h1>
  <p class="subtitle">${n.mode === 'CINEMATIFIED' ? 'Cinematified reconstruction' : 'Original reconstruction'} · ${n.wordCount.toLocaleString()} words · ${n.readingTimeMin} min read</p>
  ${body}
</body>
</html>`
}

/** Minimal valid EPUB 2 structure — a single XHTML chapter, stored-zip. */
function generateEPUB(n: NarrativeExport): Buffer {
  const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const title = escapeXml(n.title)
  const content = n.content || n.plainText || ''
  const paragraphs = content.split(/\n\n+/).map((p: string) => `  <p>${escapeXml(p)}</p>`).join('\n')

  const chapter = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${title}</title></head>
<body>
<h1>${title}</h1>
${paragraphs}
</body>
</html>`

  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPF/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`

  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${title}</dc:title>
    <dc:language>en</dc:language>
    <dc:identifier id="BookId">lemniscate-${n.id}</dc:identifier>
    <dc:creator>Lemniscate</dc:creator>
  </metadata>
  <manifest>
    <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="chapter"/>
  </spine>
</package>`

  const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="lemniscate-${n.id}"/></head>
  <docTitle><text>${title}</text></docTitle>
  <navMap><navPoint id="np1" playOrder="1"><navLabel><text>${title}</text></navLabel><content src="chapter.xhtml"/></navPoint></navMap>
</ncx>`

  const mimetypes = 'application/epub+zip'
  const files: { name: string; data: Buffer }[] = [
    { name: 'mimetype', data: Buffer.from(mimetypes, 'ascii') },
    { name: 'META-INF/container.xml', data: Buffer.from(containerXml, 'utf-8') },
    { name: 'OEBPF/content.opf', data: Buffer.from(contentOpf, 'utf-8') },
    { name: 'OEBPF/toc.ncx', data: Buffer.from(tocNcx, 'utf-8') },
    { name: 'OEBPF/chapter.xhtml', data: Buffer.from(chapter, 'utf-8') },
  ]

  // Build a stored (uncompressed) zip — simplest valid EPUB that all readers accept
  return buildZip(files)
}

/** Minimal ZIP builder (stored method, no compression) — valid per APPNOTE.TXT */
function buildZip(files: { name: string; data: Buffer }[]): Buffer {
  const chunks: Buffer[] = []
  const centralDir: Buffer[] = []
  let offset = 0

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf-8')
    const data = file.data
    const crc = crc32(data)

    // Local file header
    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0) // signature
    localHeader.writeUInt16LE(20, 4) // version needed
    localHeader.writeUInt16LE(0, 6) // flags
    localHeader.writeUInt16LE(0, 8) // compression: stored
    localHeader.writeUInt16LE(0, 10) // mod time
    localHeader.writeUInt16LE(0, 12) // mod date
    localHeader.writeUInt32LE(crc, 14) // crc32
    localHeader.writeUInt32LE(data.length, 18) // compressed size
    localHeader.writeUInt32LE(data.length, 22) // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26) // filename length
    localHeader.writeUInt16LE(0, 28) // extra field length

    chunks.push(localHeader, nameBuf, data)

    // Central directory header
    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0) // signature
    centralHeader.writeUInt16LE(20, 4) // version made by
    centralHeader.writeUInt16LE(20, 6) // version needed
    centralHeader.writeUInt16LE(0, 8) // flags
    centralHeader.writeUInt16LE(0, 10) // compression
    centralHeader.writeUInt16LE(0, 12) // mod time
    centralHeader.writeUInt16LE(0, 14) // mod date
    centralHeader.writeUInt32LE(crc, 16)
    centralHeader.writeUInt32LE(data.length, 20)
    centralHeader.writeUInt32LE(data.length, 24)
    centralHeader.writeUInt16LE(nameBuf.length, 28)
    centralHeader.writeUInt16LE(0, 30) // extra
    centralHeader.writeUInt16LE(0, 32) // comment
    centralHeader.writeUInt16LE(0, 34) // disk number
    centralHeader.writeUInt16LE(0, 36) // internal attrs
    centralHeader.writeUInt32LE(0, 38) // external attrs
    centralHeader.writeUInt32LE(offset, 42) // local header offset
    centralDir.push(centralHeader, nameBuf)

    offset += localHeader.length + nameBuf.length + data.length
  }

  const centralSize = centralDir.reduce((a, b) => a + b.length, 0)
  const centralOffset = offset

  // End of central directory
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4) // disk
  eocd.writeUInt16LE(0, 6) // disk with cd
  eocd.writeUInt16LE(files.length, 8) // entries on disk
  eocd.writeUInt16LE(files.length, 10) // total entries
  eocd.writeUInt32LE(centralSize, 12)
  eocd.writeUInt32LE(centralOffset, 16)
  eocd.writeUInt16LE(0, 20) // comment length

  return Buffer.concat([...chunks, ...centralDir, eocd])
}

/** CRC32 lookup table */
const crcTable: number[] = (() => {
  const table = new Array<number>(256)
  for (let nn = 0; nn < 256; nn++) {
    let c = nn
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[nn] = c >>> 0
  }
  return table
})()

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}
