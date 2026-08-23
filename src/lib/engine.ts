/**
 * Lemniscate ingestion engine.
 *
 * Pipeline: file detection → format parser → text cleanup → metadata
 * extraction → chapter detection → normalization → quality scoring.
 * Text formats are handled inline; binary formats (PDF/EPUB/DOCX) live in
 * engine-adapters.ts and are code-split via dynamic import.
 */
import type {
  Chapter,
  Chunk,
  ParsedDoc,
  QualityReport,
  SourceType,
} from "./types";
import { clamp } from "./utils";
import {
  parsePdf,
  parseEpub,
  parseDocx,
  parsePptx,
  sniffZipType,
} from "./engine-adapters";

export interface RawLine {
  text: string;
  heading?: boolean;
  brk?: boolean; // hard break (page boundary)
}
export interface RawDoc {
  lines: RawLine[];
  title?: string;
  author?: string;
}

export class IngestError extends Error {
  code: "type" | "size" | "parse" | "empty" | "content";
  constructor(message: string, code: IngestError["code"]) {
    super(message);
    this.code = code;
  }
}

export const FORMATS: {
  type: SourceType;
  label: string;
  exts: string[];
  mimes: string[];
  note: string;
}[] = [
  {
    type: "pdf",
    label: "PDF",
    exts: ["pdf"],
    mimes: ["application/pdf"],
    note: "Layout-tolerant text extraction",
  },
  {
    type: "epub",
    label: "EPUB",
    exts: ["epub"],
    mimes: ["application/epub+zip"],
    note: "Spine-aware chapters + metadata",
  },
  {
    type: "docx",
    label: "DOCX",
    exts: ["docx"],
    mimes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    note: "Heading styles become chapters",
  },
  {
    type: "pptx",
    label: "PPTX",
    exts: ["pptx", "ppt"],
    mimes: [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
    note: "Slide text extracted as chapters",
  },
  {
    type: "markdown",
    label: "Markdown",
    exts: ["md", "markdown"],
    mimes: ["text/markdown"],
    note: "Headings preserved as structure",
  },
  {
    type: "txt",
    label: "TXT",
    exts: ["txt", "text"],
    mimes: ["text/plain"],
    note: "Gutenberg boilerplate stripped",
  },
  {
    type: "html",
    label: "HTML",
    exts: ["html", "htm"],
    mimes: ["text/html"],
    note: "Readable content, no chrome",
  },
];

const ALL_EXTS = FORMATS.flatMap((f) => f.exts);

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

/** Detect format from extension + MIME + magic bytes. Never trusts MIME alone. */
export function detectFormat(
  name: string,
  mime: string,
  head: Uint8Array,
): SourceType | null {
  // Magic bytes win: %PDF- and PK zip signatures.
  if (
    head[0] === 0x25 &&
    head[1] === 0x50 &&
    head[2] === 0x44 &&
    head[3] === 0x46
  )
    return "pdf";
  const ext = extOf(name);
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  if (isZip) {
    if (ext === "epub") return "epub";
    if (ext === "docx") return "docx";
    if (ext === "pptx" || ext === "ppt") return "pptx";
    if (mime.includes("epub")) return "epub";
    if (mime.includes("wordprocessingml")) return "docx";
    if (mime.includes("presentationml")) return "pptx";
    return null; // unknown zip — adapters will sniff further
  }
  const byExt = FORMATS.find((f) => f.exts.includes(ext));
  if (byExt) return byExt.type;
  const byMime = FORMATS.find((f) => f.mimes.includes(mime));
  if (byMime && !ext) return byMime.type;
  return null;
}

export function validateFile(file: File, maxMB: number): SourceType {
  const ext = extOf(file.name);
  if (!ALL_EXTS.includes(ext)) {
    throw new IngestError(
      `“.${ext || "?"}” isn’t supported. Import PDF, EPUB, DOCX, PPTX, Markdown, TXT or HTML.`,
      "type",
    );
  }
  if (file.size > maxMB * 1024 * 1024) {
    throw new IngestError(
      `File exceeds the ${maxMB} MB limit (adjustable in Settings → Import).`,
      "size",
    );
  }
  if (file.size === 0) throw new IngestError("The file is empty.", "empty");
  if (ext === "htm") return "html";
  if (ext === "text") return "txt";
  if (ext === "markdown") return "markdown";
  if (ext === "ppt") return "pptx";
  return ext as SourceType;
}

/* ---------------- text normalization ---------------- */

const LIGATURES: Record<string, string> = {
  ﬁ: "fi",
  ﬂ: "fl",
  ﬃ: "ffi",
  ﬄ: "ffl",
  "…": "…",
};

/** Convert straight `"` and `'` to contextually-correct curly quotes.
 *  - `"` → `“` when whitespace precedes and non-whitespace follows (open)
 *  - `"` → `”` otherwise (close)
 *  - `'` → `’` between letters (contraction: don't, it's)
 *  - `'` → `‘` when whitespace precedes and non-whitespace follows (open)
 *  - `'` → `’` otherwise (close / apostrophe)
 *  Single-pass, stateless, leaves already-curly quotes untouched. */
function smartenQuotes(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') {
      const prev = i > 0 ? (s[i - 1] ?? " ") : " ";
      const next = i < s.length - 1 ? (s[i + 1] ?? " ") : " ";
      out += /\s/.test(prev) && /\S/.test(next) ? "\u201C" : "\u201D";
    } else if (c === "'") {
      const prev = i > 0 ? (s[i - 1] ?? " ") : " ";
      const next = i < s.length - 1 ? (s[i + 1] ?? " ") : " ";
      if (/[a-zA-Z]/.test(prev) && /[a-zA-Z]/.test(next)) out += "\u2019";
      else if (/\s/.test(prev) && /\S/.test(next)) out += "\u2018";
      else out += "\u2019";
    } else {
      out += c;
    }
  }
  return out;
}

export function cleanInline(s: string): string {
  return smartenQuotes(
    s
      // 1. Strip control characters (keep newlines out — caller already
      //    split on them; cleanInline operates per-line)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      // 2. Fix ligatures
      .replace(/[ﬁﬂﬃﬄ]/g, (m) => LIGATURES[m] ?? m)
      // 3. Collapse whitespace to single spaces (this also fixes multiple
      //    spaces after punctuation: "word.  Word" → "word. Word")
      .replace(/\s+/g, " ")
      // 4. Fix broken ellipses: ". . ." → "…", "..." → "…"
      .replace(/(?:\.\s){2}\.|\.{3,}/g, "…")
      // 5. Normalize em-dashes: " — " → "—", keep "word—word" intact.
      //    Also fold en-dashes used as parenthetical dashes to em-dash.
      .replace(/\s*[\u2014\u2013]\s*/g, "\u2014")
      // 6. Strip spaces before punctuation: "word ," → "word," (also "wait …")
      .replace(/ +([,.;:!?%)\]\u2026])/g, "$1")
      .trim(),
  );
}

/** Join hard-wrapped lines into flowing paragraphs, mending hyphen breaks. */
export function joinLines(parts: string[]): string {
  let out = "";
  for (const p of parts) {
    if (!p) continue;
    if (out.endsWith("-") && /^[a-z]/.test(p)) out = out.slice(0, -1) + p;
    else out += (out ? " " : "") + p;
  }
  return out;
}

/** Strip Project Gutenberg header/footer boilerplate. */
export function stripGutenberg(text: string): string {
  if (!/project gutenberg/i.test(text)) return text;
  const startRe =
    /\*\*\* ?START OF (THE |THIS )?(PROJECT GUTENBERG|EBOOK|E-TEXT)[^\n]*\n/i;
  const endRe = /\*\*\* ?END OF (THE |THIS )?(PROJECT GUTENBERG|EBOOK|E-TEXT)/i;
  const start = text.search(startRe);
  if (start !== -1) {
    const body = text.slice(start);
    const end = body.search(endRe);
    let core = end !== -1 ? body.slice(0, end) : body;
    core = core.replace(startRe, "");
    return core;
  }
  const license = text.search(/End of (the )?Project Gutenberg/i);
  return license !== -1 ? text.slice(0, license) : text;
}

/** Remove running headers/footers (short lines repeated many times). */
export function dedupeRunningHeads(lines: RawLine[]): {
  lines: RawLine[];
  removed: number;
} {
  const freq = new Map<string, number>();
  for (const l of lines) {
    const t = l.text.trim();
    if (t && t.length < 60 && !l.heading)
      freq.set(t.toLowerCase(), (freq.get(t.toLowerCase()) ?? 0) + 1);
  }
  let removed = 0;
  const kept = lines.filter((l) => {
    const t = l.text.trim();
    const n = freq.get(t.toLowerCase()) ?? 0;
    if (
      n >= 5 &&
      n / Math.max(1, lines.length) > 0.012 &&
      t.length < 60 &&
      !l.heading
    ) {
      removed++;
      return false;
    }
    return true;
  });
  return { lines: kept, removed };
}

/* ---------------- chapter detection ---------------- */

const HEADWORD_RE =
  /^(prologue|epilogue|introduction|preface|foreword|afterword|conclusion|appendix|glossary|part|book|chapter|section|canto|act|scene|letter|entry|note|kapitel|teil|buch|chapitre|partie|livre|cap[ií]tulo|parte|libro)\b/i;

/* English word + ordinal numbers, used for "CHAPTER ONE" / "FIRST CHAPTER". */
const EN_CARDINALS =
  "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety";
const EN_ORDINALS =
  "first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|final|last";
const EN_WORD_NUM_RE = new RegExp(
  `\\b(?:${EN_CARDINALS}|${EN_ORDINALS})(?:[-\\s](?:one|two|three|four|five|six|seven|eight|nine))?\\b`,
  "i",
);

export function isHeading(t: string): boolean {
  const s = t.trim();
  if (s.length < 2 || s.length > 80) return false;
  // False-positive filter: a heading never ends in sentence punctuation.
  if (/[.!?]$/.test(s)) return false;
  // German / French / Spanish / English headwords ("Kapitel", "Chapitre",
  // "Capítulo", etc.) at the start of the line.
  if (HEADWORD_RE.test(s)) return true;
  // English: "CHAPTER ONE", "PART TWO", "CHAPTER TWENTY-THREE", etc.
  if (
    /^(?:the\s+)?(?:chapter|part|book|canto|act|scene|section)\s+/i.test(s) &&
    EN_WORD_NUM_RE.test(s)
  )
    return true;
  // English: "FIRST CHAPTER", "THE THIRD BOOK", "FINAL ACT".
  if (
    new RegExp(
      `^(?:the\\s+)?(?:${EN_ORDINALS})\\s+(?:chapter|part|book|canto|act|scene|section)\\b`,
      "i",
    ).test(s)
  )
    return true;
  // Numeric / Roman forms (English) — kept from original implementation.
  if (/^(chapter|part|book|canto|act)\s+[ivxlcdm0-9]+[.:—-]?(\s.*)?$/i.test(s))
    return true;
  /* CJK chapter markers: 第一章 / 第1章 / 第三节 / 第五回 … (with or without a title after) */
  if (/^第\s*[0-9０-９一二三四五六七八九十百千两]+\s*[章节回部卷篇].*$/.test(s))
    return true;
  if (/^[ivxlcdm]{1,7}[.)]\s*$/i.test(s)) return true;
  /* bare Roman numeral ("IV", "XII") */
  if (/^[IVXLC]{1,7}$/.test(s)) return true;
  /* Roman numeral + title ("IV. The Return", "XII — Salt") */
  if (/^[ivxlcdm]{1,7}[.):—-]\s+\S.*$/i.test(s) && s.split(/\s+/).length <= 9)
    return true;
  /* Arabic-numbered heading ("7. Arrival") — guarded against list items and
     long narrative sentences that merely start with a number */
  if (
    /^\d{1,3}[.)]\s+\S.*$/.test(s) &&
    s.length <= 60 &&
    s.split(/\s+/).length <= 9 &&
    !/[.!?]$/.test(s)
  )
    return true;
  /* ALL-CAPS short label ("DRAMATIS PERSONAE", "PART ONE"). Filters out
     sentences which happen to be in caps via length + word-count caps. */
  const letters = s.replace(/[^a-zA-Z]/g, "");
  if (
    letters.length >= 4 &&
    letters.length >= s.replace(/\s/g, "").length - 2 &&
    s === s.toUpperCase() &&
    !/\d{3,}/.test(s) &&
    s.split(/\s+/).length <= 8
  ) {
    return true;
  }
  return false;
}

interface AccChapter {
  title: string;
  paras: string[];
}

/** Count words in a paragraph (whitespace-split, ignoring empty). */
function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

export function buildChapters(
  lines: RawLine[],
): { title: string; paras: string[] }[] {
  const chapters: AccChapter[] = [];
  let cur: AccChapter | null = null;
  let buf: string[] = [];

  const flushPara = () => {
    if (!buf.length) return;
    const para = joinLines(buf.map(cleanInline)).trim();
    buf = [];
    if (para.length > 1) {
      if (!cur) cur = { title: "Opening", paras: [] };
      cur.paras.push(para);
    }
  };

  /* Dialogue-aware structuring: a line that opens a new speaker's utterance
     (quotes, guillemets, or an em-dash speech marker) always starts a fresh
     paragraph; narrative continuation lines are mended together. */
  const SPEECH_START = /^[\u201C\u201D\u2018\u2019"'«»\u2014\u2013]/;
  for (const line of lines) {
    if (line.brk) {
      flushPara();
      continue;
    }
    const t = line.text.trim();
    if (!t) {
      flushPara();
      continue;
    }
    if ((line.heading || isHeading(t)) && t.length <= 80) {
      flushPara();
      if (cur && cur.paras.length > 0) chapters.push(cur);
      cur = { title: cleanInline(t).replace(/^#+\s*/, ""), paras: [] };
      continue;
    }
    if (SPEECH_START.test(t)) {
      // a previous paragraph that ends on closed speech also breaks here,
      // so "he said." narration never swallows the next speaker's line
      flushPara();
      buf.push(t);
      continue;
    }
    buf.push(t);
  }
  flushPara();
  if (cur && cur.paras.length > 0) chapters.push(cur);

  // A heading that ends the file with no body still counts if it's all we have.
  if (chapters.length === 0 && cur) chapters.push(cur);

  /* Merge tiny interstitial chapters: a chapter with only 1–2 very short
     paragraphs (under 50 words total) is almost certainly a false-positive
     heading (a stray ALL-CAPS line, a misclassified scene label, or a tiny
     interstitial like "***" or a single epigraph). Fold its body into the
     previous chapter so the reader doesn't get a 1-paragraph "chapter". */
  const merged: AccChapter[] = [];
  for (const ch of chapters) {
    const totalWords = ch.paras.reduce((a, p) => a + wordCount(p), 0);
    const tooSmall = ch.paras.length <= 2 && totalWords < 50;
    if (tooSmall && merged.length > 0) {
      merged[merged.length - 1]?.paras.push(...ch.paras);
    } else {
      merged.push(ch);
    }
  }
  return merged;
}

/** Split an unstructured wall of text into navigable parts (only when no headings exist).
 *  Splits on paragraph boundaries (never mid-paragraph) and prefers roughly
 *  equal parts by word count, allowing flexibility so we don't end up with a
 *  tiny orphan trailing part. */
export function fallbackSplit(
  paras: string[],
  words: number,
): { title: string; paras: string[] }[] {
  if (words < 6000) return [{ title: "Full text", paras }];
  const parts: { title: string; paras: string[] }[] = [];
  let cur: string[] = [];
  let count = 0;
  const target = 2800;
  const minPart = Math.floor(target * 0.6); // don't close a part too small
  const maxPart = Math.floor(target * 1.5); // don't let one part run away
  const roman = (n: number) =>
    ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"][
      n - 1
    ] ?? String(n);

  const flush = () => {
    if (cur.length) {
      parts.push({ title: `Part ${roman(parts.length + 1)}`, paras: cur });
      cur = [];
      count = 0;
    }
  };

  for (const p of paras) {
    const w = wordCount(p);
    // Always push the full paragraph — never split mid-paragraph.
    cur.push(p);
    count += w;
    // Decide whether to close the current part AFTER this paragraph.
    // Close if we've reached the target AND adding more would risk overshoot.
    // Specifically: if we're already at/above target, close before the next
    // paragraph would push us past maxPart. This avoids tiny orphan parts
    // (a long paragraph that pushes count from 0.5×target to 1.4×target is
    // kept whole inside the current part).
    if (count >= target) {
      // If this single paragraph is huge, the part may already exceed maxPart —
      // flush anyway since we can't split a paragraph.
      if (count >= minPart) flush();
    } else if (count >= maxPart) {
      // Safety valve (shouldn't normally trigger given target check above)
      flush();
    }
  }
  // Trailing paragraphs: if they're tiny (< 30% of target), merge back into
  // the previous part rather than creating an orphan.
  if (cur.length) {
    if (parts.length > 0 && count < target * 0.3) {
      parts[parts.length - 1]?.paras.push(...cur);
    } else {
      parts.push({ title: `Part ${roman(parts.length + 1)}`, paras: cur });
    }
  }
  return parts;
}

export function toChapters(
  sections: { title: string; paras: string[] }[],
): Chapter[] {
  let cursor = 0;
  return sections.map((s, i) => {
    const id = `ch${i}`;
    const chunks: Chunk[] = s.paras.map((text, j) => ({
      id: `${id}:${j}`,
      kind: "p" as const,
      text,
    }));
    const chapter: Chapter = {
      id,
      title: s.title || `Section ${i + 1}`,
      startChunk: cursor,
      chunks,
    };
    cursor += chunks.length;
    return chapter;
  });
}

/* ---------------- metadata ---------------- */

export function metaFromFilename(name: string): {
  title: string;
  author: string;
} {
  const base = name
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .trim();
  const dash = base.split(/\s+[-–—]\s+/);
  const dashAuthor = dash[0];
  const dashTitle = dash[1];
  if (
    dashAuthor !== undefined &&
    dashTitle !== undefined &&
    dashAuthor.length > 1 &&
    dashTitle.length > 1
  ) {
    return { author: titleCase(dashAuthor), title: titleCase(dashTitle) };
  }
  const paren = base.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (paren)
    return {
      title: titleCase(paren[1] ?? ""),
      author: titleCase(paren[2] ?? ""),
    };
  return { title: titleCase(base) || "Untitled", author: "Unknown author" };
}

export function titleCase(s: string): string {
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const hasCaps = words.some((w) => /[A-Z]{2,}/.test(w));
  if (hasCaps) return words.join(" ");
  return words
    .map((w, i) =>
      i > 0 &&
      /^(of|the|a|an|and|or|in|on|at|to|for|with)$/.test(w.toLowerCase())
        ? w.toLowerCase()
        : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(" ");
}

export function detectLanguage(sample: string): string {
  const words = sample.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 600);
  if (!words.length) return "und";
  const stops = new Set([
    "the",
    "and",
    "of",
    "to",
    "in",
    "was",
    "is",
    "that",
    "it",
    "he",
    "she",
    "with",
    "for",
    "as",
    "had",
    "his",
    "her",
    "not",
    "but",
    "be",
  ]);
  let hits = 0;
  for (const w of words) if (stops.has(w.replace(/[^a-z']/g, ""))) hits++;
  return hits / words.length > 0.045 ? "en" : "und";
}

/* ---------------- quality scoring ---------------- */

export function scoreQuality(
  text: string,
  chapterCount: number,
  notes: string[],
): QualityReport {
  let score = 100;
  const words = text.split(/\s+/).filter(Boolean);
  const garbage = (text.match(/[^\p{L}\p{N}\p{P}\p{S}\p{Z}\n]/gu) ?? []).length;
  const garbageRatio = text.length ? garbage / text.length : 0;
  if (garbageRatio > 0.02) {
    score -= 25;
    notes.push("Unusual character noise detected (possible OCR artifacts).");
  } else if (garbageRatio > 0.005) {
    score -= 10;
    notes.push("Minor character noise detected.");
  }
  if (words.length) {
    const avgLen = words.reduce((a, w) => a + w.length, 0) / words.length;
    if (avgLen < 3.1) {
      score -= 15;
      notes.push("Very short average word length — text may be fragmented.");
    }
    const shortRatio = words.filter((w) => w.length <= 2).length / words.length;
    if (shortRatio > 0.32) {
      score -= 10;
      notes.push("Many short tokens — layout debris may remain.");
    }
  }
  if (chapterCount <= 1 && words.length > 4000)
    notes.push(
      "No structural headings found; text is navigated as continuous parts.",
    );
  if (words.length < 120) {
    score -= 30;
    notes.push("Very little extractable text.");
  }
  return { score: clamp(Math.round(score), 5, 98), notes };
}

/* ---------------- parsers: text formats ---------------- */

export async function readTextFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

export function txtToLines(raw: string): RawLine[] {
  const text = stripGutenberg(raw).replace(/\r\n?/g, "\n");
  return text.split("\n").map((text2) => ({ text: text2 }));
}

export function markdownToLines(raw: string): RawLine[] {
  const out: RawLine[] = [];
  let fence = false;
  for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\s*```/.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence) {
      out.push({ text: line });
      continue;
    }
    if (/^\s*(<!--.*-->|\s*)$/.test(line)) {
      if (!line.trim()) out.push({ text: "" });
      continue;
    }
    const h = line.match(/^\s{0,3}(#{1,3})\s+(.*)$/);
    if (h) {
      out.push({ text: stripMd(h[2] ?? ""), heading: true });
      continue;
    }
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      out.push({ text: "" });
      continue;
    }
    out.push({ text: stripMd(line) });
  }
  return out;
}

export function stripMd(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)([^*_]+)\1/g, "$2")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s*>\s?/, "")
    .replace(/^\s*[-*+]\s+/, "• ");
}

/** Extract readable lines from an HTML document (shared by .html files and EPUB chapters). */
export function domToLines(
  root: Element,
  headingTags = ["h1", "h2", "h3"],
): RawLine[] {
  root
    .querySelectorAll(
      "script,style,noscript,nav,header,footer,aside,form,iframe,svg,button,figure > figcaption",
    )
    .forEach((n) => n.remove());
  const scope =
    root.querySelector("article") ?? root.querySelector("main") ?? root;
  const nodes = scope.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,blockquote,pre");
  const out: RawLine[] = [];
  nodes.forEach((el) => {
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text.length < 2) return;
    out.push({ text, heading: headingTags.includes(el.tagName.toLowerCase()) });
  });
  return out;
}

export function htmlToLines(raw: string): {
  lines: RawLine[];
  title?: string;
  author?: string;
} {
  const doc = new DOMParser().parseFromString(raw, "text/html");
  const title =
    doc.querySelector("h1")?.textContent?.trim() ||
    doc.title?.trim() ||
    undefined;
  const author =
    (doc.querySelector('meta[name="author"]') as HTMLMetaElement | null)
      ?.content || undefined;
  return { lines: domToLines(doc.body), title, author };
}

/* ---------------- orchestration ---------------- */

/** Post-parse verification: proves the text layer was actually retrieved
 *  (not just that the container opened) before anything touches the shelf. */
export function verifyParsed(
  p: ParsedDoc,
): { ok: true; passages: number } | { ok: false; reason: string } {
  const passages = p.chapters.reduce((a, c) => a + c.chunks.length, 0);
  if (p.chapters.length === 0)
    return { ok: false, reason: "No chapters were detected in this file." };
  if (passages === 0)
    return { ok: false, reason: "No readable passages were extracted." };
  const nonEmpty = p.chapters.every((c) =>
    c.chunks.some((k) => k.text.trim().length > 0),
  );
  if (!nonEmpty)
    return {
      ok: false,
      reason:
        "Extracted chapters contain no text — the file may be image-only.",
    };
  if (p.wordCount < 10)
    return {
      ok: false,
      reason: "Extracted text is too short to be a document.",
    };
  return { ok: true, passages };
}

export async function ingestFile(
  file: File,
  maxMB: number,
): Promise<ParsedDoc> {
  validateFile(file, maxMB);
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  let fmt = detectFormat(file.name, file.type, head);
  // Extension/mime unknown but the file is a zip container (PK\x03\x04)?
  // Identify it by its internal structure (EPUB mimetype entry, OOXML parts)
  // so mislabeled or extension-less archives still import.
  if (!fmt && head[0] === 0x50 && head[1] === 0x4b) {
    fmt = await sniffZipType(file);
  }
  if (!fmt)
    throw new IngestError(
      "Couldn’t identify this file’s format from its content.",
      "content",
    );

  let raw: RawDoc;
  if (fmt === "txt") {
    raw = { lines: txtToLines(await readTextFile(file)) };
  } else if (fmt === "markdown") {
    raw = { lines: markdownToLines(await readTextFile(file)) };
  } else if (fmt === "html") {
    raw = htmlToLines(await readTextFile(file));
  } else {
    raw =
      fmt === "pdf"
        ? await parsePdf(file)
        : fmt === "epub"
          ? await parseEpub(file)
          : fmt === "pptx"
            ? await parsePptx(file)
            : await parseDocx(file);
  }

  const deduped = dedupeRunningHeads(raw.lines);
  const notes: string[] = [];
  if (deduped.removed > 0)
    notes.push(`Removed ${deduped.removed} repeated running-header lines.`);

  let sections = buildChapters(deduped.lines);
  if (sections.length === 0)
    throw new IngestError(
      "No readable text could be extracted from this file.",
      "empty",
    );

  const allText = sections.flatMap((s) => s.paras).join("\n");
  const wordCount = allText.split(/\s+/).filter(Boolean).length;

  if (sections.length === 1)
    sections = fallbackSplit(sections[0]?.paras ?? [], wordCount);

  const chapters = toChapters(sections);
  const fallback = metaFromFilename(file.name);
  const title = raw.title?.trim() || fallback.title;
  const author = raw.author?.trim() || fallback.author;

  return {
    title,
    author,
    language: detectLanguage(allText.slice(0, 4000)),
    sourceType: fmt,
    chapters,
    wordCount,
    charCount: allText.length,
    quality: scoreQuality(allText, chapters.length, notes),
    warnings: notes,
  };
}

/* ---------------- chapter/chunk helpers (used by the reader) ---------------- */

export function globalChunkCount(chapters: Chapter[]): number {
  return chapters.reduce((a, c) => a + c.chunks.length, 0);
}

export function chapterAtChunk(
  chapters: Chapter[],
  globalIdx: number,
): { chapterIndex: number; localIndex: number } {
  let acc = 0;
  for (let i = 0; i < chapters.length; i++) {
    const len = chapters[i]?.chunks.length ?? 0;
    if (globalIdx < acc + len)
      return { chapterIndex: i, localIndex: globalIdx - acc };
    acc += len;
  }
  return { chapterIndex: Math.max(0, chapters.length - 1), localIndex: 0 };
}
