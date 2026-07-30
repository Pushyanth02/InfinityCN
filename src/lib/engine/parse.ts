// Lemniscate server-side parsing engine.
// Faithfully ports the audited `src/lib/engine/modules/parsers/` to a Node
// runtime. TXT / MD / HTML are fully supported; PDF uses pdfjs-dist for
// proper text extraction; DOCX/EPUB use fflate for best-effort extraction.

import "server-only";
import type { Chapter, Chunk, ParsedDoc, SourceType } from "@/lib/types";

const MAX_INPUT_BYTES = 200 * 1024 * 1024; // 200 MB hard cap

/** Generate a short unique id for chapters/chunks. Exported for the CoreEngine. */
export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** Count whitespace-separated tokens. Exported for the CoreEngine. */
export function countWords(s: string): number {
  return (s.match(/\S+/g) ?? []).length;
}

/** Split a long text into ~chunkSize-char chunks at paragraph boundaries. */
export function chunkText(text: string, chunkSize = 1200): Chunk[] {
  const chunks: Chunk[] = [];
  if (!text.trim()) return chunks;
  const paras = text.split(/\n\s*\n/);
  let buf = "";
  let offset = 0;
  let idx = 0;
  let bufStart = 0;
  for (const p of paras) {
    // Strip leading markdown heading markers (e.g. "## Subheading") so they
    // don't render as literal "##" in the reader article. The heading text
    // itself is preserved as a plain paragraph.
    const piece = p.trim().replace(/^#{1,6}\s+/, "");
    if (!piece) continue;
    if (buf.length + piece.length + 2 > chunkSize && buf) {
      chunks.push({ index: idx++, text: buf.trim(), charOffset: bufStart });
      offset += buf.length + 2;
      buf = piece;
      bufStart = offset;
    } else {
      if (buf) {
        buf += "\n\n" + piece;
      } else {
        buf = piece;
        bufStart = offset;
      }
    }
  }
  if (buf.trim()) {
    chunks.push({ index: idx, text: buf.trim(), charOffset: bufStart });
  }
  return chunks;
}

const CHAPTER_PATTERNS = [
  /^\s*chapter\s+([ivxlcdm\d]+)\s*[:.\-—]?\s*(.*)$/i,
  /^\s*ch\.?\s*(\d+)\s*[:.\-—]?\s*(.*)$/i,
  /^\s*part\s+([ivxlcdm\d]+)\s*[:.\-—]?\s*(.*)$/i,
  /^\s*book\s+([ivxlcdm\d]+)\s*[:.\-—]?\s*(.*)$/i,
  /^\s*section\s+(\d+)\s*[:.\-—]?\s*(.*)$/i,
  /^\s*(\d+)\.\s+(.*)$/, // "1. Title"
  /^\s*#\s+(.*)$/, // Markdown H1
  /^\s*##\s+(.*)$/, // Markdown H2
];

function detectChapters(text: string): { title: string; body: string }[] {
  const lines = text.split(/\r?\n/);
  const out: { title: string; body: string }[] = [];
  let current: { title: string; body: string } | null = null;
  let pendingHeader: string | null = null;

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    let matched: string | null = null;
    for (const re of CHAPTER_PATTERNS) {
      const m = trimmed.match(re);
      if (m) {
        matched = m[0];
        const title =
          m[2]?.trim() ||
          m[1]?.trim() ||
          trimmed.replace(/^#+\s*/, "").replace(/^\s*(chapter|part|book|section|ch\.?)\s+/i, "");
        if (current) out.push(current);
        current = { title: title || `Section ${out.length + 1}`, body: "" };
        pendingHeader = null;
        break;
      }
    }
    if (matched) continue;
    if (!current) {
      // Hold onto the first non-empty line as a potential title for the
      // implicit opening chapter.
      if (trimmed) {
        if (!pendingHeader) {
          pendingHeader = trimmed.slice(0, 80);
        } else {
          current = { title: pendingHeader, body: line + "\n" };
          pendingHeader = null;
        }
      }
      continue;
    }
    current.body += line + "\n";
  }
  if (current) out.push(current);
  // Drop any chapters with empty bodies (e.g. a bare H1 title line that
  // produced a chapter with no content). Keep at least one chapter so the
  // reader always has something to display.
  const nonEmpty = out.filter((c) => c.body.trim().length > 0);
  if (nonEmpty.length === 0) {
    out.push({ title: "Opening", body: text });
    return out;
  }
  return nonEmpty;
}

/** Rebuild a ParsedDoc from raw text using chapter detection + chunking. */
export function buildParsed(
  text: string,
  opts: { title?: string; author?: string; language?: string },
): ParsedDoc {
  const sections = detectChapters(text);
  const chapters: Chapter[] = sections.map((s, i) => ({
    id: uid(),
    title: s.title || `Chapter ${i + 1}`,
    ordinal: i,
    chunks: chunkText(s.body),
  }));
  const wordCount = countWords(text);
  const charCount = text.length;
  return {
    chapters,
    wordCount,
    charCount,
    language: opts.language,
    title: opts.title,
    author: opts.author,
  };
}

function parsePlainText(buf: Buffer, name: string): ParsedDoc {
  if (buf.length > MAX_INPUT_BYTES) {
    throw new Error(`File exceeds ${Math.round(MAX_INPUT_BYTES / 1024 / 1024)}MB limit`);
  }
  const text = buf.toString("utf-8");
  return buildParsed(text, { title: name.replace(/\.[^.]+$/, "") });
}

function parseMarkdown(buf: Buffer, name: string): ParsedDoc {
  const raw = buf.toString("utf-8");
  // Extract a title from the first H1 if present.
  let title: string | undefined;
  const m = raw.match(/^#\s+(.+)$/m);
  if (m) title = m[1].trim();
  // Strip frontmatter, then strip the leading H1 title line so it doesn't
  // become an empty first chapter.
  let cleaned = raw.replace(/^---\n[\s\S]*?\n---\n/, "");
  cleaned = cleaned.replace(/^#\s+.+\n*/, "");
  return buildParsed(cleaned, { title });
}

function stripHtml(s: string): string {
  // Remove scripts/styles entirely
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
  // Block-level → newlines
  s = s.replace(/<\/(p|div|section|article|h[1-6]|li|ul|ol|tr|br|hr)>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  // Drop remaining tags
  s = s.replace(/<[^>]+>/g, "");
  // Entities (minimal)
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  // Collapse excessive blank lines
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

function extractHtmlTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m?.[1]?.trim();
}

function parseHtml(buf: Buffer, _name: string): ParsedDoc {
  const html = buf.toString("utf-8");
  const text = stripHtml(html);
  return buildParsed(text, { title: extractHtmlTitle(html) });
}

// PDF text extraction using pdfjs-dist (v6 legacy build).
// pdfjs-dist properly decompresses FlateDecode streams, reconstructs
// character encodings, and exposes per-glyph positioning so we can rebuild
// line breaks from y-coordinate changes. This is a night-and-day difference
// from the old regex-based extractor which produced gibberish on any
// real-world PDF.
//
// Worker setup: pdfjs-dist detects Node at class-load time and disables the
// real Worker (sets `PDFWorker.#isWorkerDisabled = true`), so `getDocument`
// runs entirely on the main thread via a "fake worker" LoopbackPort. The
// fake worker is loaded by `import(GlobalWorkerOptions.workerSrc)`. We
// explicitly set workerSrc to an absolute file:// URL of the legacy worker
// bundle so the dynamic import resolves regardless of how Next.js bundles
// the route.

let pdfjsConfigured = false;

interface PdfjsTextItem {
  str: string;
  transform: number[]; // [a, b, c, d, e, f] — transform[5] is the y position
  width?: number;
  height?: number;
  hasEOL?: boolean;
}

interface PdfjsTextContent {
  items: Array<PdfjsTextItem | { str?: undefined }>;
}

interface PdfjsPage {
  getTextContent(): Promise<PdfjsTextContent>;
}
interface PdfjsDoc {
  numPages: number;
  getPage(n: number): Promise<PdfjsPage>;
  destroy(): Promise<void>;
}

async function loadPdfjs(): Promise<any> {
  // Polyfill DOMMatrix — pdfjs-dist v6 instantiates `new DOMMatrix()` at
  // module-load time even for text-only extraction. Node doesn't provide
  // DOMMatrix natively (it's a DOM API), so we inject a minimal polyfill
  // before the import. The polyfill only needs to exist; the values are
  // not used for text extraction.
  if (typeof (globalThis as any).DOMMatrix === "undefined") {
    class DOMMatrixPolyfill {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
      constructor(init?: unknown) {
        if (typeof init === "string") {
          const parts = init.match(/-?[\d.]+/g)?.map(Number) ?? [];
          if (parts.length >= 6) {
            [this.a, this.b, this.c, this.d, this.e, this.f] = parts;
          }
        } else if (Array.isArray(init) && init.length >= 6) {
          [this.a, this.b, this.c, this.d, this.e, this.f] = init;
        }
      }
      multiply() { return this; }
      translate() { return this; }
      scale() { return this; }
    }
    (globalThis as any).DOMMatrix = DOMMatrixPolyfill;
  }

  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjsConfigured) {
    // Pre-load the worker entry as a side-effect import. The worker module
    // sets `globalThis.pdfjsWorker = { WorkerMessageHandler }` on import,
    // which makes pdfjs's `PDFWorker.#mainThreadWorkerMessageHandler`
    // return the handler directly and skip the dynamic
    // `import(this.workerSrc)` call inside `_setupFakeWorkerGlobal`. That
    // dynamic import is what breaks under Next.js's bundler (the file://
    // URL we'd otherwise set workerSrc to gets rewritten into a mangled
    // module path). Setting workerSrc to a placeholder string keeps the
    // PDFWorker getter from throwing.
    await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc =
      "pdfjs-dist/legacy/build/pdf.worker.mjs";
    pdfjsConfigured = true;
  }
  return pdfjs;
}

/** Repair common PDF text-extraction artifacts (ligatures, NBSPs, etc.). */
function cleanPdfText(text: string): string {
  return text
    // Ligatures → letter pairs
    .replace(/\uFB00/g, "ff")
    .replace(/\uFB01/g, "fi")
    .replace(/\uFB02/g, "fl")
    .replace(/\uFB03/g, "ffi")
    .replace(/\uFB04/g, "ffl")
    .replace(/\uFB05/g, "ft")
    .replace(/\uFB06/g, "st")
    // Soft hyphen leftover from line wrapping — drop entirely
    .replace(/\u00AD/g, "")
    // Non-breaking space → regular space
    .replace(/\u00A0/g, " ")
    // Replacement char → drop
    .replace(/\uFFFD/g, "")
    // Zero-width chars
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    // Form feed → newline (some PDFs use it as a page separator)
    .replace(/\f/g, "\n")
    // Collapse 3+ newlines → 2 (paragraph break)
    .replace(/\n{3,}/g, "\n\n")
    // Trim trailing whitespace per line
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trim();
}

/**
 * Reconstruct readable text from a pdfjs text content. Uses the y-coordinate
 * (transform[5]) to detect line breaks: when consecutive items jump by more
 * than ~2 units in y, we start a new line. The pdfjs `hasEOL` flag is also
 * honored when present.
 */
function reconstructText(content: PdfjsTextContent): string {
  const lines: string[] = [];
  let currentLine = "";
  let lastY: number | null = null;

  const flushLine = () => {
    const trimmed = currentLine.replace(/\s+$/g, "");
    if (trimmed) lines.push(trimmed);
    currentLine = "";
  };

  for (const raw of content.items) {
    if (!raw || typeof (raw as any).str !== "string") continue;
    const item = raw as PdfjsTextItem;
    if (item.str === "") {
      // Empty string sometimes carries an EOL flag
      if (item.hasEOL) {
        flushLine();
        lastY = null;
      }
      continue;
    }
    const y = item.transform?.[5];
    if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) {
      flushLine();
    }
    currentLine += item.str;
    if (item.hasEOL) {
      flushLine();
      lastY = null;
    } else {
      lastY = y ?? lastY;
    }
  }
  flushLine();
  return lines.join("\n");
}

async function parsePdf(buf: Buffer, name: string): Promise<ParsedDoc> {
  if (buf.length > MAX_INPUT_BYTES) {
    throw new Error(
      `File exceeds ${Math.round(MAX_INPUT_BYTES / 1024 / 1024)}MB limit`,
    );
  }
  const pdfjs = await loadPdfjs();
  // Copy into a fresh Uint8Array so pdfjs can take ownership / neuter it
  // without affecting the caller's Buffer.
  const data = new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const doc = await pdfjs.getDocument({
    data,
    disableFontFace: true,
    useSystemFonts: false,
    isOffscreenCanvasSupported: false,
    verbosity: 0,
  }).promise as PdfjsDoc;
  try {
    const pageTexts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = reconstructText(content);
      pageTexts.push(text);
      // Release page resources promptly.
      const maybePage = page as any;
      if (typeof maybePage.cleanup === "function") {
        try { await maybePage.cleanup(); } catch { /* ignore */ }
      }
    }
    // Join pages with a paragraph break; each page already ends without a
    // trailing newline from reconstructText.
    const joined = pageTexts.filter((t) => t.length > 0).join("\n\n");
    const cleaned = cleanPdfText(joined);

    if (!cleaned.trim()) {
      // No extractable text — likely an image-only / scanned PDF. Surface
      // a clear warning via the chapter body so the user understands why
      // the doc is empty.
      return buildParsed(
        "[This PDF contains no extractable text. It may be a scanned image PDF — OCR is not supported.]",
        { title: name.replace(/\.[^.]+$/, "") },
      );
    }

    return buildParsed(cleaned, { title: name.replace(/\.[^.]+$/, "") });
  } finally {
    try { await doc.destroy(); } catch { /* ignore */ }
  }
}

// Best-effort DOCX: a .docx is a zip — extract word/document.xml and strip tags.
async function parseDocx(buf: Buffer, name: string): Promise<ParsedDoc> {
  // Lazy-load fflate if available; otherwise bail with a clear message.
  let fflate: any;
  try {
    // Optional dependency: resolved dynamically so the build doesn't require it.
    const mod: string = "fflate";
    fflate = await import(mod);
  } catch {
    throw new Error("DOCX parsing requires the fflate package");
  }
  const unzipped = fflate.unzipSync(new Uint8Array(buf));
  const docXml = unzipped["word/document.xml"];
  if (!docXml) throw new Error("word/document.xml not found in DOCX");
  const xml = new TextDecoder().decode(docXml);
  // Paragraph breaks
  let s = xml.replace(/<w:p\b[^>]*>/g, "\n");
  s = s.replace(/<w:br\b[^/]*\/>/g, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
  return buildParsed(s.trim(), { title: name.replace(/\.[^.]+$/, "") });
}

// EPUB: zip with XHTML spine items. Best-effort extraction.
async function parseEpub(buf: Buffer, name: string): Promise<ParsedDoc> {
  let fflate: any;
  try {
    // Optional dependency: resolved dynamically so the build doesn't require it.
    const mod: string = "fflate";
    fflate = await import(mod);
  } catch {
    throw new Error("EPUB parsing requires the fflate package");
  }
  const unzipped = fflate.unzipSync(new Uint8Array(buf));
  // Find content.opf
  const opfName = Object.keys(unzipped).find((k) => k.endsWith(".opf"));
  if (!opfName) throw new Error("EPUB container.opf not found");
  const opfXml = new TextDecoder().decode(unzipped[opfName]);
  // Discover spine hrefs (very loose)
  interface ManifestItem { href: string; mediaType: string }
  const manifest = new Map<string, ManifestItem>();
  const itemRe = /<item\b[^>]*id="([^"]+)"[^>]*href="([^"]+)"[^>]*media-type="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(opfXml)) !== null) {
    manifest.set(m[1], { href: m[2], mediaType: m[3] });
  }
  // Also accept self-closing variant with attributes in different order
  const itemRe2 = /<item\b[^>]*href="([^"]+)"[^>]*id="([^"]+)"[^>]*media-type="([^"]+)"/g;
  while ((m = itemRe2.exec(opfXml)) !== null) {
    manifest.set(m[2], { href: m[1], mediaType: m[3] });
  }
  const spineRe = /<itemref\b[^>]*idref="([^"]+)"/g;
  const spineIds: string[] = [];
  while ((m = spineRe.exec(opfXml)) !== null) spineIds.push(m[1]);

  const baseDir = opfName.includes("/") ? opfName.slice(0, opfName.lastIndexOf("/") + 1) : "";
  const parts: string[] = [];
  let title: string | undefined;
  const titleM = opfXml.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
  if (titleM) title = titleM[1].trim();
  const authorM = opfXml.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
  const author = authorM?.[1]?.trim();

  for (const id of spineIds) {
    const item = manifest.get(id);
    if (!item) continue;
    const href = item.href;
    const path = (baseDir + href).replace(/\\/g, "/");
    const bytes = unzipped[path];
    if (!bytes) continue;
    const html = new TextDecoder().decode(bytes);
    if (!title) {
      const t = extractHtmlTitle(html);
      if (t) title = t;
    }
    parts.push(stripHtml(html));
  }
  if (parts.length === 0) {
    // Fallback: concatenate any xhtml/html files
    for (const k of Object.keys(unzipped)) {
      if (k.endsWith(".xhtml") || k.endsWith(".html") || k.endsWith(".htm")) {
        parts.push(stripHtml(new TextDecoder().decode(unzipped[k])));
      }
    }
  }
  const text = parts.join("\n\n");
  return buildParsed(text, { title: title || name.replace(/\.[^.]+$/, ""), author });
}

export async function parseFile(
  buf: Buffer,
  type: SourceType,
  name: string,
): Promise<ParsedDoc> {
  switch (type) {
    case "txt":
      return parsePlainText(buf, name);
    case "md":
      return parseMarkdown(buf, name);
    case "html":
      return parseHtml(buf, name);
    case "pdf":
      return await parsePdf(buf, name);
    case "docx":
      return await parseDocx(buf, name);
    case "epub":
      return await parseEpub(buf, name);
    default:
      // Try plain text as a fallback
      return parsePlainText(buf, name);
  }
}
