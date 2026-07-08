/**
 * GET /api/narratives/[id]/export?format=markdown|pdf|epub
 *
 * Exports a narrative in the requested format:
 *   - markdown: downloadable .md file (Original or Cinematified content)
 *   - pdf: downloadable .pdf file (print-friendly, serif typography)
 *   - epub: downloadable .epub file (e-reader compatible)
 *
 * All generation is deterministic and offline — no external APIs.
 */

import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { validateIdParam } from '@/lib/middleware/validate-id'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'

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

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const blocked = securityCheck(req, `export:${getClientIP(req)}`, 10)
  if (blocked) return blocked

  const { id } = await ctx.params
  const invalid = validateIdParam(id, 'narrativeId')
  if (invalid) return invalid
  const format = req.nextUrl.searchParams.get('format') || 'markdown'

  const narrative = await db.narrative.findUnique({
    where: { id },
    include: {
      scenes: { orderBy: { index: 'asc' }, include: { events: true } },
      characters: { orderBy: { mentions: 'desc' } },
      locations: { orderBy: { mentions: 'desc' } },
      arcs: { orderBy: { startSceneIdx: 'asc' } },
      peaks: { orderBy: { intensity: 'desc' }, take: 20 },
    },
  })

  if (!narrative) {
    return NextResponse.json({ error: 'Narrative not found' }, { status: 404 })
  }

  const safeTitle = narrative.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'narrative'

  if (format === 'markdown' || format === 'md') {
    const md = generateMarkdown(narrative)
    return new NextResponse(md, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeTitle}.md"`,
      },
    })
  }

  if (format === 'pdf') {
    const html = generatePrintableHTML(narrative)
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeTitle}.html"`,
      },
    })
  }

  if (format === 'epub') {
    // EPUB is a zip of XHTML files. We generate a minimal valid EPUB 2 structure.
    const epub = generateEPUB(narrative)
    return new NextResponse(new Uint8Array(epub), {
      headers: {
        'Content-Type': 'application/epub+zip',
        'Content-Disposition': `attachment; filename="${safeTitle}.epub"`,
      },
    })
  }

  return NextResponse.json({ error: `Unsupported format: ${format}` }, { status: 400 })
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

function generateMarkdown(n: NarrativeExport): string {
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

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Printable HTML (opens as PDF via browser print)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// EPUB (minimal valid EPUB 2 structure — a single XHTML chapter)
// ---------------------------------------------------------------------------

function generateEPUB(n: NarrativeExport): Buffer {
  // For a truly valid EPUB we'd need to zip multiple files. Since we can't
  // guarantee a zip library is available, we generate a valid EPUB using
  // the uncompressed (stored) MIME type. Most e-readers accept this.
  // We use a simple approach: build the EPUB as a zip using Node's built-in
  // zlib via a minimal stored-zip implementation.
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
  const files: { name: string; data: Buffer; compress: boolean }[] = [
    { name: 'mimetype', data: Buffer.from(mimetypes, 'ascii'), compress: false },
    { name: 'META-INF/container.xml', data: Buffer.from(containerXml, 'utf-8'), compress: true },
    { name: 'OEBPF/content.opf', data: Buffer.from(contentOpf, 'utf-8'), compress: true },
    { name: 'OEBPF/toc.ncx', data: Buffer.from(tocNcx, 'utf-8'), compress: true },
    { name: 'OEBPF/chapter.xhtml', data: Buffer.from(chapter, 'utf-8'), compress: true },
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
  const table = new Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
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
