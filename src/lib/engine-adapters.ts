/**
 * Binary format adapters — code-split so pdf.js / JSZip only load on demand.
 *
 * Next.js adaptation: the pdf.js worker is served from /public/pdf.worker.min.mjs
 * (copied at build time from pdfjs-dist/build/) and referenced via workerSrc.
 * A main-thread fallback covers any environment where the worker fails to spawn.
 */
import type { RawDoc, RawLine } from "./engine";
import { IngestError, domToLines, isHeading } from "./engine";

/* ---------------- DOCX ---------------- */

export async function parseDocx(file: File): Promise<RawDoc> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const docXml = await zip.file("word/document.xml")?.async("string");
  if (!docXml) throw new IngestError("This file isn\u2019t a valid DOCX document.", "content");

  const xml = new DOMParser().parseFromString(docXml, "application/xml");
  const paras = xml.getElementsByTagName("w:p");

  interface P { text: string; style: string; bold: boolean; size: number }
  const collected: P[] = [];
  for (const p of Array.from(paras)) {
    const text = Array.from(p.getElementsByTagName("w:t"))
      .map((t) => t.textContent ?? "")
      .join("");
    const style = p.getElementsByTagName("w:pStyle")[0]?.getAttribute("w:val") ?? "";
    const bold = p.getElementsByTagName("w:b").length > 0;
    const sizeRaw = p.getElementsByTagName("w:sz")[0]?.getAttribute("w:val");
    collected.push({ text, style, bold, size: sizeRaw ? Number(sizeRaw) / 2 : 0 });
  }

  const sizes = collected.filter((c) => c.size > 0 && c.text.trim()).map((c) => c.size).sort((a, b) => a - b);
  const medianSize = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0;

  const lines: RawLine[] = collected.map((c) => {
    const t = c.text.trim();
    const styledHeading = /^Heading[1-3]$|^Title$/i.test(c.style);
    const sizedHeading = c.bold && t.length > 2 && t.length < 70 && medianSize > 0 && c.size >= medianSize * 1.25;
    return { text: c.text, heading: styledHeading || sizedHeading || (!!t && isHeading(t)) };
  });

  let title: string | undefined;
  let author: string | undefined;
  const core = await zip.file("docProps/core.xml")?.async("string");
  if (core) {
    const meta = new DOMParser().parseFromString(core, "application/xml");
    title = meta.getElementsByTagNameNS("*", "title")[0]?.textContent?.trim() || undefined;
    author = meta.getElementsByTagNameNS("*", "creator")[0]?.textContent?.trim() || undefined;
  }
  return { lines, title, author };
}

/* ---------------- EPUB ---------------- */

function resolvePath(base: string, href: string): string {
  try {
    const url = new URL(href.replace(/#.*$/, ""), `https://x/${base}/`);
    return decodeURIComponent(url.pathname.replace(/^\//, ""));
  } catch {
    return href;
  }
}

export async function parseEpub(file: File): Promise<RawDoc> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  const mimetype = await zip.file("mimetype")?.async("string");
  if (mimetype && !mimetype.includes("epub")) throw new IngestError("This archive isn\u2019t a valid EPUB.", "content");

  const containerXml = await zip.file("META-INF/container.xml")?.async("string");
  if (!containerXml) throw new IngestError("Malformed EPUB: missing container.", "content");
  const container = new DOMParser().parseFromString(containerXml, "application/xml");
  const opfPath = container.getElementsByTagName("rootfile")[0]?.getAttribute("full-path");
  if (!opfPath) throw new IngestError("Malformed EPUB: no package document.", "content");

  const opfXml = await zip.file(opfPath)?.async("string");
  if (!opfXml) throw new IngestError("Malformed EPUB: package document not found.", "content");
  const opf = new DOMParser().parseFromString(opfXml, "application/xml");

  const title = opf.getElementsByTagNameNS("*", "title")[0]?.textContent?.trim() || undefined;
  const author = opf.getElementsByTagNameNS("*", "creator")[0]?.textContent?.trim() || undefined;

  const manifest = new Map<string, { href: string; type: string }>();
  for (const item of Array.from(opf.getElementsByTagNameNS("*", "item"))) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (id && href) manifest.set(id, { href, type: item.getAttribute("media-type") ?? "" });
  }
  const spineIds = Array.from(opf.getElementsByTagNameNS("*", "itemref"))
    .map((r) => r.getAttribute("idref"))
    .filter((x): x is string => !!x);

  const baseDir = opfPath.includes("/") ? opfPath.split("/").slice(0, -1).join("/") : "";
  const lines: RawLine[] = [];
  let sectionN = 0;

  for (const id of spineIds.slice(0, 400)) {
    const entry = manifest.get(id);
    if (!entry || !(entry.type.includes("html") || entry.type.includes("xml") || /\.x?html?$/i.test(entry.href))) continue;
    const path = resolvePath(baseDir, entry.href);
    const content = await zip.file(path)?.async("string");
    if (!content) continue;
    const doc = new DOMParser().parseFromString(content, "text/html");
    doc.querySelectorAll("script,style").forEach((n) => n.remove());
    const body = doc.body ?? doc.documentElement;
    const fileLines = domToLines(body, ["h1", "h2"]);
    const hasHeading = fileLines.some((l) => l.heading);
    const hasText = fileLines.some((l) => l.text.trim().length > 40);
    if (!hasText) continue;
    sectionN++;
    if (!hasHeading) {
      const fileTitle = doc.title?.trim() || path.split("/").pop()?.replace(/\.\w+$/, "").replace(/[-_]/g, " ") || `Section ${sectionN}`;
      lines.push({ text: fileTitle, heading: true });
    }
    lines.push(...fileLines, { text: "", brk: true });
  }

  if (!lines.length) throw new IngestError("No readable chapters found inside this EPUB.", "empty");
  return { lines, title, author };
}

/* ---------------- PDF ---------------- */

type PdfJsModule = typeof import("pdfjs-dist");
type PdfDoc = Awaited<ReturnType<PdfJsModule["getDocument"]>["promise"]>;
interface OutlineEntry {
  title: string;
  dest: string | unknown[] | null;
  items: OutlineEntry[];
}

let pdfjsPromise: Promise<PdfJsModule> | null = null;
let workerReady = false;

/** Load pdf.js and configure its worker.
 *
 *  The worker is served from /pdf.worker.min.mjs (copied to /public at build
 *  time). If the worker fails to initialize, we fall through to the
 *  main-thread strategy at parse time. */
async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      if (!workerReady) {
        try {
          // The worker file is served statically from /public.
          pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
          workerReady = true;
        } catch {
          /* fall through to tier 2 at parse time */
        }
      }
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

async function ensureMainThreadWorker(): Promise<void> {
  const g = globalThis as { pdfjsWorker?: { WorkerMessageHandler?: unknown } };
  if (g.pdfjsWorker?.WorkerMessageHandler) return;
  const mod = await import("pdfjs-dist/build/pdf.worker.min.mjs");
  g.pdfjsWorker = { WorkerMessageHandler: mod.WorkerMessageHandler };
}

/** Resolve a pdf.js outline `dest` first-element to a 0-based page index.
 *  `dest[0]` is typically a `RefProxy` (`{num, gen}`) referring to a page
 *  dictionary; sometimes it's a bare number (page index). */
async function resolveDestPage(doc: PdfDoc, dest0: unknown): Promise<number | null> {
  if (typeof dest0 === "number" && Number.isFinite(dest0)) return dest0;
  if (dest0 && typeof dest0 === "object" && "num" in dest0 && "gen" in dest0) {
    try {
      return await doc.getPageIndex(dest0 as { num: number; gen: number });
    } catch {
      return null;
    }
  }
  return null;
}

/** Walk the document outline (Table of Contents) and return a map from
 *  1-based page number → outline title. Only top 2 levels are kept so that
 *  deeply-nested sub-entries (often sub-sections within a chapter) don't
 *  fragment the structure. Best-effort — failures fall back to heuristics. */
async function extractToc(doc: PdfDoc): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  try {
    const outline = (await doc.getOutline()) as OutlineEntry[] | null;
    if (!outline || !outline.length) return out;
    const walk = async (entries: OutlineEntry[], depth: number) => {
      for (const entry of entries) {
        if (depth > 1) continue; // top 2 levels only
        let dest0: unknown = null;
        if (typeof entry.dest === "string") {
          try {
            const resolved = await doc.getDestination(entry.dest);
            if (resolved && resolved.length) dest0 = resolved[0];
          } catch { /* skip named dest that can't resolve */ }
        } else if (Array.isArray(entry.dest) && entry.dest.length) {
          dest0 = entry.dest[0];
        }
        const pageIdx = dest0 != null ? await resolveDestPage(doc, dest0) : null;
        const title = (entry.title || "").trim();
        if (pageIdx != null && pageIdx >= 0 && pageIdx < doc.numPages && title) {
          // First outline entry at this page wins (top levels come first)
          if (!out.has(pageIdx + 1)) out.set(pageIdx + 1, title);
        }
        if (entry.items?.length) await walk(entry.items, depth + 1);
      }
    };
    await walk(outline, 0);
  } catch { /* TOC is best-effort */ }
  return out;
}

/** Standalone short numeric page-number candidate (top/bottom of page). */
function isPageNumberLike(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^\d{1,4}$/.test(t)) return true;
  if (/^[ivxlcdm]{1,6}$/i.test(t)) return true; // roman lower/upper
  if (/^(?:page)?\s*\d{1,4}\s*$/i.test(t)) return true;
  return false;
}

/** Sentence-terminator check used to suppress heading promotion of body
 *  lines that merely happen to be set in a large font (e.g. drop-caps,
 *  first paragraphs). */
function endsWithSentencePunct(text: string): boolean {
  return /[.!?\u2026]$/.test(text.trim());
}

/** Cluster font heights into buckets (rounded to nearest 0.5pt). Returns the
 *  body height (most-frequent bucket) and the heading threshold (top-quartile
 *  unique height). */
function clusterHeights(heights: number[]): { bodyH: number; headingThreshold: number } {
  if (!heights.length) return { bodyH: 10, headingThreshold: 12 };
  const buckets = new Map<number, number>();
  for (const h of heights) {
    const key = Math.round(h * 2) / 2; // 0.5pt resolution
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  // Body height = highest-frequency bucket (the body text dominates)
  let bodyH = 10;
  let bodyCount = -1;
  for (const [h, n] of buckets) {
    if (n > bodyCount) { bodyH = h; bodyCount = n; }
  }
  // Heading threshold = top 25% of unique heights (rounded)
  const uniq = [...buckets.keys()].sort((a, b) => a - b);
  let headingThreshold: number;
  if (uniq.length >= 4) {
    headingThreshold = uniq[Math.floor(uniq.length * 0.75)];
  } else if (uniq.length >= 2) {
    headingThreshold = uniq[uniq.length - 1]; // largest bucket
  } else {
    headingThreshold = bodyH * 1.15;
  }
  // Safety: heading threshold must be at least slightly above body
  if (headingThreshold <= bodyH) headingThreshold = bodyH * 1.15;
  return { bodyH, headingThreshold };
}

export async function parsePdf(file: File): Promise<RawDoc> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());

  let doc: PdfDoc;
  try {
    doc = await pdfjs.getDocument({ data }).promise;
  } catch {
    // Worker failed to spawn or died mid-parse — retry once on the main
    // thread with a fresh worker strategy.
    try {
      await ensureMainThreadWorker();
      doc = await pdfjs.getDocument({ data }).promise;
    } catch {
      throw new IngestError(
        "This PDF could not be opened — it may be encrypted, corrupted, or image-only.",
        "content"
      );
    }
  }

  // 1. Pull the embedded Table of Contents (PDF outline). When present it is
  //    the single most reliable source of chapter boundaries — far better
  //    than font-size heuristics.
  const chapterStarts = await extractToc(doc);

  // 2. Extract text rows per page, recording page number and intra-page row
  //    index so we can later detect page numbers (top/bottom rows) and page
  //    boundaries.
  interface PLine {
    text: string;
    h: number;
    gap: number;
    page: number;       // 1-based
    rowIdx: number;    // 0-based index within page (after empty-row skip)
    rowCount: number;  // total non-empty rows on this page
  }
  const allLines: PLine[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const rows = new Map<number, { x: number; str: string; h: number }[]>();
    for (const it of tc.items) {
      const item = it as { str?: string; transform?: number[]; height?: number };
      if (!item.str || !item.transform) continue;
      const y = Math.round(item.transform[5]);
      const h = item.height || Math.abs(item.transform[3]) || 10;
      const row = rows.get(y) ?? [];
      row.push({ x: item.transform[4], str: item.str, h });
      rows.set(y, row);
    }
    const ys = [...rows.keys()].sort((a, b) => b - a); // top→bottom (PDF y grows upward)
    let prevY: number | null = null;
    const nonEmptyRows = ys.filter((y) => rows.get(y)!.some((r) => r.str.trim().length > 0));
    const rowCount = nonEmptyRows.length;
    let rowIdx = 0;
    for (const y of nonEmptyRows) {
      const items = rows.get(y)!.sort((a, b) => a.x - b.x);
      // Mend hyphenated line breaks within a single visual row: pdf.js
      // sometimes emits "word-" and "break" as separate items at the same y.
      const text = items.map((i) => i.str).join("").replace(/-\s+/g, "-").trim()
        .replace(/\s+/g, " ").trim();
      if (!text) { rowIdx++; continue; }
      allLines.push({
        text,
        h: Math.max(...items.map((i) => i.h)),
        gap: prevY === null ? 0 : Math.abs(prevY - y),
        page: p,
        rowIdx,
        rowCount,
      });
      prevY = y;
      rowIdx++;
    }
  }

  if (!allLines.length) throw new IngestError("No extractable text — this PDF may be scanned images.", "empty");

  // 3. Filter out obvious page numbers (standalone short numeric lines at
  //    top/bottom of page). Running headers/footers (repeated prose) are
  //    handled downstream by dedupeRunningHeads — we only pre-filter the
  //    unambiguous numeric page markers here so they don't pollute paragraph
  //    flow across page boundaries.
  const filtered = allLines.filter((l) => {
    if (!isPageNumberLike(l.text)) return true;
    // Only treat as a page number if it's at the top (first 2 rows) or
    // bottom (last 2 rows) of its page.
    return l.rowIdx > 1 && l.rowIdx < l.rowCount - 2;
  });

  // 4. Font-size clustering: identify body height + heading threshold.
  const heights = filtered.map((l) => l.h).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 10;
  const { bodyH, headingThreshold } = clusterHeights(heights);
  void bodyH; // (kept for clarity; headingThreshold is what we use)

  const gaps = filtered.map((l) => l.gap).filter((g) => g > 0).sort((a, b) => a - b);
  const medianGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 12;

  // 5. Heading predicate: top-quartile font + short + no sentence punctuation,
  //    OR all-caps short line, OR title-case short line.
  const isLikelyHeading = (l: PLine): boolean => {
    const t = l.text.trim();
    if (t.length < 2 || t.length > 80) return false;
    if (endsWithSentencePunct(t)) return false;
    if (isPageNumberLike(t)) return false;
    const words = t.split(/\s+/);
    // Top-quartile font size + short + few words
    if (l.h >= headingThreshold && words.length <= 12) return true;
    // ALL-CAPS line (Latin-only, short)
    const letters = t.replace(/[^a-zA-Z]/g, "");
    if (
      letters.length >= 4 &&
      letters === letters.toUpperCase() &&
      t.length < 60 &&
      words.length <= 8 &&
      !/\d{3,}/.test(t)
    ) return true;
    // Title-Case line with no terminal punctuation: ≥60% of words start
    // with a capital letter. Filters out sentences (only proper nouns
    // are capitalized mid-sentence).
    if (t.length > 6 && t.length < 60 && words.length >= 2 && words.length <= 8) {
      const capCount = words.filter((w) => /^[A-Z]/.test(w)).length;
      if (capCount / words.length >= 0.6) return true;
    }
    return false;
  };

  // 6. Identify the first non-page-number row on each page (used to attach
  //    TOC titles when the actual visual line doesn't already look like a
  //    heading).
  const firstRealLinePerPage = new Map<number, PLine>();
  for (const l of filtered) {
    if (!firstRealLinePerPage.has(l.page)) firstRealLinePerPage.set(l.page, l);
  }

  // 7. Assemble RawLine[]. Page boundaries emit a `brk` ONLY when the next
  //    page actually starts with heading-like content (or the TOC says so),
  //    so chapters that span pages flow naturally instead of being split.
  const lines: RawLine[] = [];
  for (let i = 0; i < filtered.length; i++) {
    const l = filtered[i];
    const prev = i > 0 ? filtered[i - 1] : null;
    const tocTitle = chapterStarts.get(l.page);
    const isPageFirstLine = firstRealLinePerPage.get(l.page) === l;
    const headingLike = isLikelyHeading(l);
    const isChapterStart = !!tocTitle;

    // Page transition: emit a hard break only if the new page begins a
    // heading or chapter. Otherwise let paragraphs flow across the boundary
    // (page numbers + headers are already stripped above).
    if (prev && prev.page !== l.page) {
      if (isChapterStart || headingLike) {
        lines.push({ text: "", brk: true });
      }
    }

    // TOC-backed chapter start: ensure a heading appears at the top of
    // the page. If the actual first line is already heading-like or
    // matches the TOC title textually, just promote it. Otherwise inject
    // the TOC title as a synthetic heading before the body text.
    let isHeadingLine = headingLike;
    let injected = false;
    if (isPageFirstLine && isChapterStart && tocTitle) {
      const normLine = l.text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().slice(0, 24);
      const normToc = tocTitle.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().slice(0, 24);
      const matchesToc = normLine.length >= 3 && normToc.length >= 3 &&
        (normLine.includes(normToc) || normToc.includes(normLine));
      if (headingLike || matchesToc || l.h >= headingThreshold) {
        isHeadingLine = true;
      } else {
        lines.push({ text: tocTitle, heading: true });
        injected = true;
      }
    }

    // Layout-aware paragraph detection: a large vertical gap before this
    // line signals a new paragraph. Don't double-mark headings.
    const isGap = l.gap > Math.max(medianGap * 2.5, medianH * 2.4);
    lines.push({
      text: l.text,
      heading: isHeadingLine,
      brk: isGap && !isHeadingLine && !injected,
    });
  }

  // 8. Best-effort metadata.
  let title: string | undefined;
  let author: string | undefined;
  try {
    const meta = await doc.getMetadata();
    const info = meta?.info as { Title?: string; Author?: string } | undefined;
    title = info?.Title?.trim() || undefined;
    author = info?.Author?.trim() || undefined;
  } catch { /* metadata is best-effort */ }

  void medianH;
  return { lines, title, author };
}

/* ---------------- PPTX (PowerPoint) ---------------- */

/** Parse a .pptx file by extracting text from each slide's XML.
 *
 *  PPTX is a ZIP archive containing `ppt/slides/slideN.xml` files. Each
 *  slide's text is in `<a:t>` elements inside text-body shapes. We extract
 *  all text runs per slide, treat each slide as a "chapter", and use the
 *  slide title (from `<p:ph type="title">`) or the first text line as the
 *  chapter heading.
 */
export async function parsePptx(file: File): Promise<RawDoc> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  // Find all slide files, sorted numerically
  const slideFiles = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)/i)?.[1] ?? "0", 10);
      const nb = parseInt(b.match(/slide(\d+)/i)?.[1] ?? "0", 10);
      return na - nb;
    });

  if (slideFiles.length === 0) {
    throw new IngestError("No slides found in this PPTX file.", "empty");
  }

  const lines: RawLine[] = [];
  let title: string | undefined;
  let author: string | undefined;

  for (const slidePath of slideFiles) {
    const content = await zip.file(slidePath)?.async("string");
    if (!content) continue;

    const xml = new DOMParser().parseFromString(content, "application/xml");

    // Extract all text runs from <a:t> elements
    const textElements = xml.getElementsByTagName("a:t");
    const texts: string[] = [];
    for (const el of Array.from(textElements)) {
      const t = (el.textContent ?? "").trim();
      if (t) texts.push(t);
    }

    if (texts.length === 0) continue;

    // Try to get the slide title from the title placeholder
    const titleEls = xml.getElementsByTagName("p:ph");
    let slideTitle: string | undefined;
    for (const el of Array.from(titleEls)) {
      if (el.getAttribute("type") === "title") {
        // The title text is in the nearest preceding <a:t> within the same shape
        const shape = el.closest("p:sp");
        if (shape) {
          const shapeTexts = shape.getElementsByTagName("a:t");
          if (shapeTexts.length > 0) {
            slideTitle = (shapeTexts[0].textContent ?? "").trim();
            break;
          }
        }
      }
    }

    // If no title placeholder, use the first text line as the heading
    if (!slideTitle) slideTitle = texts[0];

    // Add the slide title as a heading
    lines.push({ text: `Slide ${slidePath.match(/slide(\d+)/i)?.[1] ?? ""}: ${slideTitle}`, heading: true });

    // Add all text runs as content lines
    for (const t of texts) {
      lines.push({ text: t });
    }

    // Add a page break after each slide
    lines.push({ text: "", brk: true });
  }

  // Try to extract metadata from docProps/core.xml
  const core = await zip.file("docProps/core.xml")?.async("string");
  if (core) {
    const meta = new DOMParser().parseFromString(core, "application/xml");
    title = meta.getElementsByTagNameNS("*", "title")[0]?.textContent?.trim() || undefined;
    author = meta.getElementsByTagNameNS("*", "creator")[0]?.textContent?.trim() || undefined;
  }

  if (lines.length === 0) {
    throw new IngestError("No text could be extracted from this PPTX — it may contain only images.", "empty");
  }

  return { lines, title, author };
}
