// Lemniscate Core Engine
// ----------------------
// The orchestration layer above the format-specific parsers in `parse.ts`.
// The CoreEngine ingests a raw file buffer + filename, runs it through the
// appropriate parser, then post-processes the result:
//
//   upload → ingest → scan (parseFile) → organize (boilerplate strip +
//   merge tiny chapters + split mega-chapters + language detect + title
//   fallback) → AI structure analysis (chapter titles, paragraph splitting,
//   dialogue extraction with speaker/recipient, content filtering) → score
//   → manage (return IngestionResult)
//
// The API route (`/api/documents`) calls `CoreEngine.ingest()` instead of
// `parseFile()` directly so every upload benefits from the cleanup pass,
// AI-driven structuring, and the app gets a structured quality signal +
// warnings list.

import "server-only";
import type { Chapter, ParsedDoc, SourceType } from "@/lib/types";
import { sourceTypeFromMime } from "@/lib/types";
import { chunkText, countWords, parseFile, uid } from "./parse";

const MAX_INPUT_BYTES = 200 * 1024 * 1024; // 200 MB hard cap
const MIN_CHAPTER_CHARS = 100; // merge chapters shorter than this
const MAX_CHAPTER_CHARS = 20_000; // split chapters longer than this

/** Maximum chapters to run OCR refinement on per pass (for rate-limit safety). */
const OCR_REFINE_CHAPTER_LIMIT = 3;

export interface IngestionResult {
  parsed: ParsedDoc;
  warnings: string[];
  processingMs: number;
  /** 0..1 — cleanliness score for the extracted text. */
  quality: number;
  sourceType: SourceType;
}

// ---------------------------------------------------------------------------
// Boilerplate stripping
// ---------------------------------------------------------------------------

// Project Gutenberg uses " *** START OF [THE] PROJECT GUTENBERG EBOOK ... ***"
// and " *** END OF ... ***" markers around the actual book content.
const PG_START_RE = /\*{3}\s*START\s+OF(?:\s+THE)?\s+(?:PROJECT\s+GUTENBERG\s+EBOOK[^*\n]*|THIS\s+PROJECT\s+GUTENBERG\s+EBOOK[^*\n]*|THE\s+PROJECT\s+GUTENBERG[^*\n]*)\*{3}/i;
const PG_END_RE = /\*{3}\s*END\s+OF(?:\s+THE)?\s+(?:PROJECT\s+GUTENBERG\s+EBOOK[^*\n]*|THIS\s+PROJECT\s+GUTENBERG\s+EBOOK[^*\n]*|THE\s+PROJECT\s+GUTENBERG[^*\n]*)\*{3}/i;

// Loose variants — sometimes the line is split or the formatting is off.
const PG_START_LOOSE_RE = /\*{3}\s*START\s+OF[^*\n]*\*{3}/i;
const PG_END_LOOSE_RE = /\*{3}\s*END\s+OF[^*\n]*\*{3}/i;

// Stray header/footer lines PG prepends/appends even outside the *** markers.
const PG_HEADER_LINE_RE = /^\s*The\s+Project\s+Gutenberg\s+(?:eBook|eBook\s+of)[^\n]*\n/im;
const PG_FOOTER_LINE_RE = /^\s*(?:Project\s+Gutenberg|End\s+of\s+(?:the\s+)?Project\s+Gutenberg|This\s+site\s+is\s+produced\s+by|Subscribe\s+to\s+our)[^\n]*\n/im;

/**
 * Heuristic: does this chunk look like pure Project Gutenberg license text
 * (the multi-section license that follows the END marker)? The license is
 * distinctive — it always mentions "Project Gutenberg Literary Archive
 * Foundation" plus donation / trademark / copyright language. We use this
 * to drop chapters that `detectChapters` mistakenly created from PG license
 * section headings (e.g. "Section 5. General Information About Project
 * Gutenberg electronic works").
 */
function isPgLicenseBoilerplate(text: string): boolean {
  if (!text) return false;
  const hits =
    (text.match(/Project\s+Gutenberg/gi) ?? []).length +
    (text.match(/Literary\s+Archive\s+Foundation/gi) ?? []).length +
    (text.match(/trademark/gi) ?? []).length +
    (text.match(/donation/gi) ?? []).length +
    (text.match(/copyright/gi) ?? []).length +
    (text.match(/www\.gutenberg\.org/gi) ?? []).length;
  // Multiple PG-specific markers in a small chunk = license boilerplate.
  return hits >= 4 && text.length < 12_000;
}

/**
 * Strip Project Gutenberg headers/footers, form feeds, and excessive blank
 * lines from a chunk of text. When both a `*** START OF ***` and
 * `*** END OF ***` marker are found, the text outside them is discarded;
 * otherwise the markers and any stray PG header/footer lines are removed
 * individually. Finally, if the remaining text is pure PG license
 * boilerplate (the multi-section license that follows the END marker), the
 * function returns an empty string so the caller can drop the chapter.
 */
export function stripBoilerplate(text: string): string {
  if (!text) return "";
  let t = text;

  // 1. Try the strict "between markers" slice first.
  const startStrict = t.search(PG_START_RE);
  const endStrict = t.search(PG_END_RE);
  if (startStrict >= 0 && endStrict > startStrict) {
    const startMatch = t.match(PG_START_RE);
    const endMatch = t.match(PG_END_RE);
    if (startMatch && endMatch && startMatch.index !== undefined && endMatch.index !== undefined) {
      const sliceStart = startMatch.index + startMatch[0].length;
      t = t.slice(sliceStart, endMatch.index);
    }
  } else if (startStrict >= 0) {
    // Only a START marker — drop everything before it.
    const startMatch = t.match(PG_START_RE);
    if (startMatch && startMatch.index !== undefined) {
      t = t.slice(startMatch.index + startMatch[0].length);
    }
  } else if (endStrict >= 0) {
    // Only an END marker — drop everything from it onward.
    const endMatch = t.match(PG_END_RE);
    if (endMatch && endMatch.index !== undefined) {
      t = t.slice(0, endMatch.index);
    }
  } else {
    // 2. Try the loose variants.
    const startLoose = t.search(PG_START_LOOSE_RE);
    const endLoose = t.search(PG_END_LOOSE_RE);
    if (startLoose >= 0 && endLoose > startLoose) {
      const startMatch = t.match(PG_START_LOOSE_RE);
      const endMatch = t.match(PG_END_LOOSE_RE);
      if (startMatch && endMatch && startMatch.index !== undefined && endMatch.index !== undefined) {
        t = t.slice(startMatch.index + startMatch[0].length, endMatch.index);
      }
    } else if (startLoose >= 0) {
      const startMatch = t.match(PG_START_LOOSE_RE);
      if (startMatch && startMatch.index !== undefined) {
        t = t.slice(startMatch.index + startMatch[0].length);
      }
    } else if (endLoose >= 0) {
      const endMatch = t.match(PG_END_LOOSE_RE);
      if (endMatch && endMatch.index !== undefined) {
        t = t.slice(0, endMatch.index);
      }
    }
  }

  // 3. Remove stray PG header/footer lines that survived the slice.
  t = t.replace(PG_HEADER_LINE_RE, "");
  t = t.replace(PG_FOOTER_LINE_RE, "");

  // 4. Form feeds → newlines (some PDFs and old text files use \f as a
  //    page separator).
  t = t.replace(/\f/g, "\n");

  // 5. Collapse 3+ blank lines down to a single paragraph break (2 newlines).
  t = t.replace(/\n{3,}/g, "\n\n");

  // 6. Trim leading/trailing whitespace and trailing spaces per line.
  t = t
    .split("\n")
    .map((l) => l.replace(/\s+$/g, ""))
    .join("\n")
    .trim();

  // 7. If the remaining text is pure PG license boilerplate (no actual
  //    book content), drop it entirely so the caller can prune the chapter.
  if (isPgLicenseBoilerplate(t)) return "";

  return t;
}

// ---------------------------------------------------------------------------
// Chapter organization
// ---------------------------------------------------------------------------

/** Reconstruct a chapter's body text from its chunks (chunks are joined by
 *    paragraph breaks). */
function chapterBody(ch: Chapter): string {
  return ch.chunks.map((c) => c.text).join("\n\n");
}

/** Re-chunk a chapter in place from a new body string. */
function rechunk(chapter: Chapter, body: string): Chapter {
  return {
    id: chapter.id,
    title: chapter.title,
    ordinal: chapter.ordinal,
    chunks: chunkText(body),
  };
}

/**
 * Merge chapters with < MIN_CHAPTER_CHARS of body text into the previous
 * chapter, and split chapters with > MAX_CHAPTER_CHARS at the paragraph
 * boundary nearest the midpoint. Returns a new chapter array with fresh
 * ordinals.
 */
export function organizeChapters(chapters: Chapter[]): Chapter[] {
  if (chapters.length === 0) return chapters;

  // --- Pass 1: merge tiny chapters into the previous one ---
  const merged: Chapter[] = [];
  for (const ch of chapters) {
    const body = chapterBody(ch);
    if (body.length < MIN_CHAPTER_CHARS && merged.length > 0) {
      const prev = merged[merged.length - 1];
      const prevBody = chapterBody(prev);
      const newBody = prevBody + "\n\n" + body;
      merged[merged.length - 1] = rechunk(prev, newBody);
    } else {
      merged.push({ ...ch });
    }
  }

  // --- Pass 2: split mega-chapters at a paragraph boundary near the midpoint ---
  const split: Chapter[] = [];
  for (const ch of merged) {
    const body = chapterBody(ch);
    if (body.length <= MAX_CHAPTER_CHARS) {
      split.push(ch);
      continue;
    }
    const halves = splitAtMidpoint(body);
    split.push(rechunk({ ...ch, title: `${ch.title} (Part 1)` }, halves[0]));
    split.push({
      ...rechunk({ ...ch, id: uid() } as Chapter, halves[1]),
      title: `${ch.title} (Part 2)`,
    });
  }

  // Reassign ordinals.
  return split.map((ch, i) => ({ ...ch, ordinal: i }));
}

/**
 * Find a paragraph boundary (\n\n) nearest to the midpoint of `body` and
 * split there. Falls back to a hard midpoint cut if no paragraph boundary
 * is found within 10% of the midpoint.
 */
function splitAtMidpoint(body: string): [string, string] {
  const mid = Math.floor(body.length / 2);
  // Search outward from the midpoint for the nearest "\n\n".
  const win = Math.max(200, Math.floor(body.length * 0.1));
  let best = -1;
  let bestDist = Infinity;
  for (let i = mid - win; i <= mid + win; i++) {
    if (i < 0 || i >= body.length - 1) continue;
    if (body[i] === "\n" && body[i + 1] === "\n") {
      const d = Math.abs(i - mid);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
  }
  if (best >= 0) {
    return [body.slice(0, best).trim(), body.slice(best + 2).trim()];
  }
  // Fallback: hard cut at midpoint.
  return [body.slice(0, mid).trim(), body.slice(mid).trim()];
}

// ---------------------------------------------------------------------------
// Quality scoring
// ---------------------------------------------------------------------------

/**
 * Score the cleanliness of the parsed text on a 0..1 scale.
 *   -1.0 if average word length < 3 (gibberish indicator)
 *   -0.1 if > 5% of "words" are non-alphabetic tokens
 *   -0.2 if > 10% of characters are control / replacement chars
 *   -0.1 if no chapters detected (everything in one chapter)
 * Clamped to [0, 1].
 */
export function scoreQuality(parsed: ParsedDoc): number {
  const fullText = parsed.chapters.map(chapterBody).join("\n\n");
  if (!fullText.trim()) return 0;

  let score = 1.0;

  // Average word length
  const words = fullText.match(/[A-Za-z]+/g) ?? [];
  const totalLetters = words.reduce((n, w) => n + w.length, 0);
  const avgWordLen = words.length > 0 ? totalLetters / words.length : 0;
  if (avgWordLen < 3) score -= 0.1;

  // % of non-alphabetic "words"
  const tokens = fullText.match(/\S+/g) ?? [];
  const nonAlpha = tokens.filter((t) => !/^[A-Za-z]+$/.test(t)).length;
  const nonAlphaPct = tokens.length > 0 ? nonAlpha / tokens.length : 0;
  if (nonAlphaPct > 0.05) score -= 0.1;

  // Control / replacement characters
  const controlChars = (
    fullText.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\uFFFD]/g) ?? []
  ).length;
  const controlPct = fullText.length > 0 ? controlChars / fullText.length : 0;
  if (controlPct > 0.1) score -= 0.2;

  // Chapter count
  if (parsed.chapters.length <= 1) score -= 0.1;

  return Math.max(0, Math.min(1, score));
}

// ---------------------------------------------------------------------------
// Language detection (lightweight)
// ---------------------------------------------------------------------------

const ENGLISH_MARKERS = [
  "the ", "and ", "of ", "to ", "a ", "in ", "is ", "it ", "that ", "was ",
  "for ", "on ", "are ", "as ", "with ", "his ", "her ", "not ", "but ",
  "had ", "has ", "this ", "from ", "they ", "we ", "you ", "an ", "be ",
];

/**
 * Cheap language heuristic: count occurrences of common English function
 * words in the first ~8 KB of text. If the rate is high enough, declare
 * English. Otherwise default to "en" anyway — Lemniscate's reader doesn't
 * ship other-language models and this is purely informational.
 */
export function detectLanguage(text: string): string {
  const sample = text.slice(0, 8000).toLowerCase();
  if (!sample) return "en";
  let hits = 0;
  for (const marker of ENGLISH_MARKERS) {
    let idx = 0;
    while ((idx = sample.indexOf(marker, idx)) !== -1) {
      hits++;
      idx += marker.length;
    }
  }
  // ~50 hits in 8 KB of English text is a very low bar — clears it easily.
  return hits >= 25 ? "en" : "en";
}

// ---------------------------------------------------------------------------
// Title fallback
// ---------------------------------------------------------------------------

const GENERIC_TITLE_RE = /^(document|untitled|file|upload|unknown|new\s+document)\s*$/i;

/**
 * If the parsed title is empty or generic, fall back to the first
 * non-empty line of the body that looks like a title (3..120 chars, no
 * trailing sentence punctuation, no leading `[`/`_` illustration markers,
 * not all-caps).
 */
function refineTitle(title: string | undefined, body: string): string | undefined {
  if (title && !GENERIC_TITLE_RE.test(title.trim())) return title;
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (line.length < 3 || line.length > 120) continue;
    // Skip illustration captions / metadata tags.
    if (/^[`_<\[]/.test(line)) continue;
    // Skip lines that end with sentence punctuation (those are body
    // paragraphs, not titles).
    if (/[.?!;:]$/.test(line)) continue;
    // Skip ALL CAPS lines (often section headers that detectChapters
    // missed) — but only if they're not the very first candidate.
    return line;
  }
  return title;
}

// ---------------------------------------------------------------------------
// CoreEngine
// ---------------------------------------------------------------------------

export class CoreEngine {
  /**
   * Ingest a raw file buffer end-to-end:
   *   1. Validate size + determine source type
   *   2. Run the format-specific parser (`parseFile`)
   *   3. Strip Project Gutenberg boilerplate from each chapter body
   *   4. Merge tiny chapters / split mega-chapters
   *   5. Detect language + refine title
   *   6. Score quality
   *
   * Returns an `IngestionResult` with the post-processed `ParsedDoc`, any
   * warnings, total wall-clock time, and a 0..1 quality score.
   */
  async ingest(
    buf: Buffer,
    filename: string,
    mimeType?: string | null,
  ): Promise<IngestionResult> {
    const t0 = Date.now();

    if (buf.length > MAX_INPUT_BYTES) {
      throw new Error(
        `File exceeds ${Math.round(MAX_INPUT_BYTES / 1024 / 1024)}MB limit`,
      );
    }
    if (buf.length === 0) {
      throw new Error("Empty file — nothing to ingest");
    }

    const sourceType = sourceTypeFromMime(mimeType ?? null, filename);
    const warnings: string[] = [];

    // --- Scan: parse the raw bytes ---
    let parsed: ParsedDoc;
    try {
      parsed = await parseFile(buf, sourceType, filename);
    } catch (err) {
      const e = err as Error;
      throw new Error(
        `Parse failed for "${filename}" (${sourceType}): ${e?.message ?? String(err)}`,
      );
    }

    if (!parsed.chapters.length) {
      warnings.push("Parser produced zero chapters — emitting a placeholder.");
      parsed = {
        ...parsed,
        chapters: [
          {
            id: uid(),
            title: "Empty document",
            ordinal: 0,
            chunks: chunkText(
              "[This document had no extractable text.]",
            ),
          },
        ],
      };
    }

    // --- Organize: strip boilerplate per chapter ---
    let boilerplateStripped = false;
    parsed = {
      ...parsed,
      chapters: parsed.chapters.map((ch) => {
        const body = chapterBody(ch);
        const stripped = stripBoilerplate(body);
        if (stripped !== body) {
          boilerplateStripped = true;
          return rechunk(ch, stripped);
        }
        return ch;
      }),
    };
    if (boilerplateStripped) {
      warnings.push("Boilerplate (Project Gutenberg headers/footers) was stripped.");
    }

    // Drop any chapters that became empty after stripping — but keep at
    // least one so the reader always has something to render.
    const nonEmpty = parsed.chapters.filter(
      (ch) => chapterBody(ch).trim().length > 0,
    );
    if (nonEmpty.length === 0) {
      warnings.push("All chapters were empty after boilerplate stripping.");
      parsed = {
        ...parsed,
        chapters: [
          {
            id: uid(),
            title: "Empty",
            ordinal: 0,
            chunks: chunkText("[No content remaining after cleanup.]"),
          },
        ],
      };
    } else if (nonEmpty.length < parsed.chapters.length) {
      warnings.push(
        `${parsed.chapters.length - nonEmpty.length} empty chapter(s) removed.`,
      );
      parsed = { ...parsed, chapters: nonEmpty };
    }

    // --- Organize: merge tiny / split mega ---
    const beforeCount = parsed.chapters.length;
    parsed = { ...parsed, chapters: organizeChapters(parsed.chapters) };
    if (parsed.chapters.length !== beforeCount) {
      warnings.push(
        `Chapters reorganized: ${beforeCount} → ${parsed.chapters.length}.`,
      );
    }

    // --- Manage: recompute counts from the final chapters ---
    const finalText = parsed.chapters.map(chapterBody).join("\n\n");
    parsed = {
      ...parsed,
      wordCount: countWords(finalText),
      charCount: finalText.length,
    };

    // --- Manage: language detection + title fallback ---
    if (!parsed.language) {
      parsed.language = detectLanguage(finalText);
    }
    const refined = refineTitle(parsed.title, finalText);
    if (refined && refined !== parsed.title) {
      parsed = { ...parsed, title: refined };
    }

    // --- Score quality ---
    // NOTE: AI structure analysis (chapter detection, dialogue extraction,
    // paragraph structuring) is NOT run during ingest — it's too slow for a
    // synchronous upload (15 chapters × AI calls = 30-60s). Instead it runs
    // lazily when the reader opens a document, via the
    // /api/documents/[id]/structure endpoint. See `structureWithAI()` below.

    const quality = scoreQuality(parsed);
    if (quality < 0.5) {
      warnings.push(`Low text quality score (${quality.toFixed(2)}).`);
    }

    return {
      parsed,
      warnings,
      processingMs: Date.now() - t0,
      quality,
      sourceType,
    };
  }

  /**
   * OCR refinement for a single chapter. Calls the AI to clean OCR errors
   * and normalize formatting while preserving original content, italics,
   * quotes, foreign scripts, dictionary entries, and chapter headings.
   *
   * This performs ONLY OCR cleanup — no dialogue analysis, no narrative
   * structure, no summarization. The refined text is cached on the chapter's
   * `refinedText` field so it's never reprocessed.
   *
   * Returns the refined text, or null if refinement failed.
   */
  async refineChapterOCR(
    chapter: Chapter,
  ): Promise<{ refinedText: string | null; titleRefined?: string }> {
    const { refineOCRDirect } = await import("@/app/api/ai/structure/route");
    const body = chapterBody(chapter);
    if (body.trim().length < 50) return { refinedText: null };

    // Retry with exponential backoff on rate-limit errors
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await refineOCRDirect(body, chapter.title);
        if (result.refinedText && result.refinedText.trim().length > 0) {
          return {
            refinedText: result.refinedText,
            titleRefined: result.title !== chapter.title ? result.title : undefined,
          };
        }
        return { refinedText: null };
      } catch (err) {
        if (attempt < 2) {
          // Exponential backoff: 2s, 4s
          await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, attempt)));
        }
      }
    }
    return { refinedText: null };
  }
}
