/**
 * Lemniscate — Deterministic Document Metadata Detection
 * ----------------------------------------------------------------------------
 * Extracts a document's canonical metadata (title, author, subtitle, series,
 * chapters, language, word count, reading time) using ONLY deterministic
 * heuristics — no AI, no models, fully reproducible.
 *
 * Title detection priority (highest → lowest):
 *   1. Embedded document metadata (PDF Info dictionary / DOCX core.xml)
 *   2. First title/header detected in the document body
 *   3. Most prominent early line (typography proxy for PDF — caps/centering)
 *   4. Chapter heading heuristics
 *   5. Filename (final fallback)
 *
 * The detected metadata populates the document library automatically.
 */

import { computeStats, titleCase } from '../nlp/core'
import type { OriginalParagraph } from './original'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Embedded metadata surfaced by the extractor (PDF Info / DOCX core.xml). */
export interface EmbeddedMetadata {
  title?: string
  author?: string
  subject?: string
  keywords?: string
}

export interface DetectedChapter {
  index: number
  title: string
  /** Character offset of the chapter heading within the reconstructed text. */
  offset: number
}

export type TitleSource =
  | 'embedded'
  | 'heading'
  | 'typography'
  | 'chapter'
  | 'filename'

export interface DetectedMetadata {
  title: string
  titleSource: TitleSource
  author: string | null
  subtitle: string | null
  series: string | null
  chapters: DetectedChapter[]
  chapterCount: number
  language: string
  wordCount: number
  readingTimeMin: number
}

export interface DetectMetadataInput {
  /** Reconstructed / cleaned document text. */
  text: string
  /** Paragraphs from the ORIGINAL-mode transformer (already classified). */
  paragraphs: OriginalParagraph[]
  /** Embedded metadata from the extractor (may be empty). */
  embedded?: EmbeddedMetadata
  /** Original uploaded filename (used only as the final fallback). */
  filename: string
  /** Language detected during extraction (fallback if body detection fails). */
  language?: string
}

// ---------------------------------------------------------------------------
// Shared patterns
// ---------------------------------------------------------------------------

/** Structural headings that are never a book title (chapter markers etc.). */
const STRUCTURAL_HEADING_RE =
  /^(chapter|chapitre|kapitel|capitolo|cap[íi]tulo|prologue|prolog|epilogue|epilog|part|book|act|scene|section|introduction|intro|preface|prologo|foreword|afterword|appendix|contents|table of contents|dedication|acknowledge?ments?|about the author|copyright)\b/i

/** Chapter-marker detection (multilingual-ish, deterministic). */
const CHAPTER_MARKER_RE =
  /^\s*(?:(chapter|chapitre|kapitel|capitolo|cap[íi]tulo)\s+(\d{1,3}|[ivxlcdm]{1,7}|[a-z]+)|(prologue|prolog|epilogue|epilog|introduction|preface|foreword|afterword)|(part|book|act)\s+(\d{1,3}|[ivxlcdm]{1,7}|[a-z]+))\b(?:\s*[:.\u2014-]\s*(.+))?$/i

/** Filenames/titles that embedded metadata often contains but are useless. */
const JUNK_TITLE_RE =
  /^(untitled|document\d*|new document|microsoft word|microsoft word -|.*\.(?:docx?|pdf|txt|md|rtf|odt)|title|body|normal(?:\.dotm?)?)$/i

const AUTHOR_LINE_RE =
  /^\s*(?:by|written by|author|authored by|a novel by)[\s:]+([A-Z][\p{L}.'-]+(?:\s+[A-Z][\p{L}.'-]+){0,3})\s*$/u

const AUTHOR_INLINE_RE =
  /\bby\s+([A-Z][\p{L}.'-]+(?:\s+[A-Z][\p{L}.'-]+){1,3})\b/u

/** Series signals: "Book 2 of The Foo", "The Foo Trilogy", "(The Foo #3)". */
const SERIES_PATTERNS: RegExp[] = [
  /\((?:the\s+)?([A-Z][\p{L} '’-]+?)\s+(?:series|saga|trilogy|cycle|chronicles?|sequence)(?:\s*,?\s*(?:book|vol(?:ume)?|no\.?|#)?\s*\d+)?\)/iu,
  /\b(?:book|vol(?:ume)?|part)\s+(?:\d{1,3}|[ivxlcdm]{1,7})\s+(?:of|in)\s+(?:the\s+)?([A-Z][\p{L} '’-]+?)(?:\s+(?:series|saga|trilogy|cycle|chronicles?))?\s*$/imu,
  /^([A-Z][\p{L} '’-]+?)\s+(?:series|saga|trilogy|cycle|chronicles?)(?:\s*(?:book|vol(?:ume)?|no\.?|#)?\s*\d+)?\s*$/imu,
  /\b([A-Z][\p{L} '’-]+?)\s+#\s*\d+\b/u,
]

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function detectDocumentMetadata(input: DetectMetadataInput): DetectedMetadata {
  const { text, paragraphs, embedded, filename } = input

  const filenameTitle = cleanFilename(filename)
  const chapters = detectChapters(paragraphs)
  const language = detectLanguageMulti(text) || input.language || 'en'

  // ---- Title (priority chain) --------------------------------------------
  let title = ''
  let titleSource: TitleSource = 'filename'

  const embeddedTitle = sanitizeCandidate(embedded?.title)
  if (embeddedTitle && !JUNK_TITLE_RE.test(embeddedTitle) && !isFilenameEcho(embeddedTitle, filename)) {
    title = embeddedTitle
    titleSource = 'embedded'
  }

  if (!title) {
    const headingTitle = firstBodyHeading(paragraphs)
    if (headingTitle) {
      title = headingTitle
      titleSource = 'heading'
    }
  }

  if (!title) {
    const prominent = mostProminentEarlyLine(text)
    if (prominent) {
      title = prominent
      titleSource = 'typography'
    }
  }

  if (!title && chapters.length > 0) {
    // A document that is only chapters — fall back to the first chapter title.
    title = chapters[0].title
    titleSource = 'chapter'
  }

  if (!title) {
    title = filenameTitle
    titleSource = 'filename'
  }

  title = tidyTitle(title)

  // ---- Author -------------------------------------------------------------
  const author =
    sanitizeCandidate(embedded?.author) ||
    detectAuthor(text, title) ||
    null

  // ---- Subtitle -----------------------------------------------------------
  const subtitle = detectSubtitle(paragraphs, title)

  // ---- Series -------------------------------------------------------------
  const series =
    detectSeries(text) ||
    (embedded?.subject ? detectSeries(embedded.subject) : null) ||
    null

  // ---- Counts -------------------------------------------------------------
  const stats = computeStats(text)

  return {
    title,
    titleSource,
    author: author && author.toLowerCase() !== title.toLowerCase() ? author : null,
    subtitle: subtitle && subtitle.toLowerCase() !== title.toLowerCase() ? subtitle : null,
    series,
    chapters,
    chapterCount: chapters.length,
    language,
    wordCount: stats.wordCount,
    readingTimeMin: stats.readingTimeMin,
  }
}

// ---------------------------------------------------------------------------
// Title candidates
// ---------------------------------------------------------------------------

/** First non-structural HEADING paragraph near the top of the document. */
function firstBodyHeading(paragraphs: OriginalParagraph[]): string {
  const scanLimit = Math.min(paragraphs.length, 12)
  for (let i = 0; i < scanLimit; i++) {
    const p = paragraphs[i]
    if (p.type !== 'HEADING') continue
    const t = p.text.replace(/^#+\s*/, '').trim()
    if (!t || STRUCTURAL_HEADING_RE.test(t)) continue
    if (p.wordCount > 15) continue
    return t
  }
  return ''
}

/**
 * Typography proxy for PDFs (pdf-parse yields text without font sizes):
 * scan the first lines and pick the most "prominent" short line — an
 * ALL-CAPS or Title-Case line that appears before the prose body and is not a
 * chapter marker. Deterministic scoring, first best wins on ties.
 */
function mostProminentEarlyLine(text: string): string {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 25)

  let best: { line: string; score: number } | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const words = line.split(/\s+/)
    if (words.length < 1 || words.length > 15) continue
    if (/[.!?]$/.test(line)) continue // full sentence — likely body text
    if (STRUCTURAL_HEADING_RE.test(line)) continue
    if (AUTHOR_LINE_RE.test(line)) continue
    if (line.length < 3 || line.length > 90) continue

    let score = 0
    const letters = line.replace(/[^A-Za-z]/g, '')
    if (letters.length >= 3) {
      const upper = (line.match(/[A-Z]/g) || []).length
      const ratio = upper / letters.length
      if (ratio > 0.85) score += 5 // ALL CAPS
      else if (isTitleCased(line)) score += 3
    }
    // Prominence decays with position — titles appear first.
    score += Math.max(0, 6 - i)
    if (words.length >= 2 && words.length <= 8) score += 2

    if (score > 0 && (!best || score > best.score)) {
      best = { line, score }
    }
  }
  return best ? best.line : ''
}

// ---------------------------------------------------------------------------
// Chapters
// ---------------------------------------------------------------------------

function detectChapters(paragraphs: OriginalParagraph[]): DetectedChapter[] {
  const chapters: DetectedChapter[] = []
  let index = 0
  for (const p of paragraphs) {
    const line = p.text.replace(/^#+\s*/, '').trim()
    const m = CHAPTER_MARKER_RE.exec(line)
    if (!m) {
      // Also accept HEADING-typed paragraphs that read like chapter titles
      // (short, non-structural) only if we already have chapters — this keeps
      // pure title lines from being miscounted as chapters.
      continue
    }
    const label = buildChapterLabel(m, line)
    chapters.push({ index: index++, title: label, offset: p.startOffset })
  }
  return chapters
}

function buildChapterLabel(m: RegExpExecArray, line: string): string {
  // Groups: 1=chapterWord 2=chapterNum 3=namedSection 4=partWord 5=partNum 6=trailingTitle
  const trailing = (m[6] || '').trim()
  if (m[3]) {
    // Prologue / Epilogue / Introduction / etc.
    const named = titleCase(m[3])
    return trailing ? `${named}: ${trailing}` : named
  }
  const word = titleCase(m[1] || m[4] || 'Chapter')
  const num = (m[2] || m[5] || '').toUpperCase()
  const base = num ? `${word} ${num}` : word
  return trailing ? `${base}: ${trailing}` : base || line
}

// ---------------------------------------------------------------------------
// Author / subtitle / series
// ---------------------------------------------------------------------------

function detectAuthor(text: string, title: string): string | null {
  const head = text.slice(0, 1500)
  const lines = head.split('\n').map((l) => l.trim())

  // Explicit "by <Name>" line.
  for (const line of lines.slice(0, 20)) {
    const m = AUTHOR_LINE_RE.exec(line)
    if (m) {
      const name = m[1].trim()
      if (name.toLowerCase() !== title.toLowerCase()) return name
    }
  }

  // Inline "by <Name>" near the top (guard against "by the time" etc.).
  const inline = AUTHOR_INLINE_RE.exec(head)
  if (inline) {
    const name = inline[1].trim()
    const firstWord = name.split(/\s+/)[0].toLowerCase()
    const STOP = new Set(['the', 'a', 'an', 'this', 'that', 'then', 'now', 'means', 'way', 'time', 'chance', 'far'])
    if (!STOP.has(firstWord) && name.toLowerCase() !== title.toLowerCase()) return name
  }

  return null
}

function detectSubtitle(paragraphs: OriginalParagraph[], title: string): string | null {
  // A subtitle is a short descriptive line immediately following the title
  // heading, before the prose body begins.
  const scanLimit = Math.min(paragraphs.length, 8)
  let sawTitle = false
  for (let i = 0; i < scanLimit; i++) {
    const p = paragraphs[i]
    const t = p.text.replace(/^#+\s*/, '').trim()
    if (!sawTitle) {
      if (t.toLowerCase() === title.toLowerCase()) sawTitle = true
      continue
    }
    // First line after the title.
    if (STRUCTURAL_HEADING_RE.test(t)) return null
    if (AUTHOR_LINE_RE.test(t)) return null
    if (CHAPTER_MARKER_RE.test(t)) return null
    if (p.type === 'DIALOGUE' || p.type === 'NARRATION' || p.type === 'ACTION') return null
    if (p.wordCount >= 2 && p.wordCount <= 14 && !/[.!?]$/.test(t) && isTitleCasedOrSentence(t)) {
      return tidyTitle(t)
    }
    return null
  }
  return null
}

function detectSeries(text: string): string | null {
  const head = text.slice(0, 2500)
  for (const re of SERIES_PATTERNS) {
    const m = re.exec(head)
    if (m && m[1]) {
      const name = m[1].trim().replace(/\s+/g, ' ')
      if (name.length >= 3 && name.length <= 60) return tidyTitle(name)
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Language detection (multi-language, deterministic function-word scoring)
// ---------------------------------------------------------------------------

const LANGUAGE_STOPWORDS: Record<string, string[]> = {
  en: ['the', 'and', 'of', 'to', 'in', 'is', 'that', 'was', 'it', 'he', 'she', 'for', 'with', 'as', 'his', 'her'],
  es: ['el', 'la', 'de', 'que', 'y', 'los', 'las', 'un', 'una', 'en', 'con', 'por', 'para', 'su', 'del', 'se'],
  fr: ['le', 'la', 'les', 'de', 'des', 'et', 'un', 'une', 'que', 'qui', 'dans', 'pour', 'pas', 'sur', 'ce', 'il'],
  de: ['der', 'die', 'das', 'und', 'den', 'von', 'zu', 'mit', 'sich', 'auf', 'ein', 'eine', 'ist', 'nicht', 'dem', 'war'],
  it: ['il', 'la', 'di', 'che', 'e', 'un', 'una', 'per', 'con', 'non', 'del', 'della', 'le', 'si', 'lo', 'in'],
  pt: ['o', 'a', 'de', 'que', 'e', 'do', 'da', 'em', 'um', 'uma', 'os', 'as', 'com', 'não', 'por', 'para'],
}

/**
 * Detect language among a curated set of Latin-script languages by counting
 * function-word hits. Deterministic; returns an ISO-639-1 code, or 'en' when
 * ambiguous but clearly Latin-script text.
 */
export function detectLanguageMulti(text: string): string | null {
  if (!text || text.trim().length < 40) return null
  const sample = text.slice(0, 6000).toLowerCase()
  const words = sample.match(/[\p{L}]+/gu)
  if (!words || words.length < 20) return null

  const counts: Record<string, number> = {}
  const wordSet = new Map<string, number>()
  for (const w of words) wordSet.set(w, (wordSet.get(w) || 0) + 1)

  for (const [lang, stops] of Object.entries(LANGUAGE_STOPWORDS)) {
    let hits = 0
    for (const s of stops) hits += wordSet.get(s) || 0
    counts[lang] = hits
  }

  let bestLang = 'en'
  let bestHits = -1
  for (const [lang, hits] of Object.entries(counts)) {
    if (hits > bestHits) {
      bestHits = hits
      bestLang = lang
    }
  }
  // Require a minimal signal; otherwise treat as undetermined.
  return bestHits >= 3 ? bestLang : 'en'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '')
  const spaced = base.replace(/[_+]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  // If it looks like a slug (all-lower with dashes), title-case it.
  if (/^[a-z0-9 -]+$/.test(spaced) && spaced.includes('-') && !spaced.includes(' ')) {
    return titleCase(spaced.replace(/-+/g, ' '))
  }
  return spaced.replace(/-{2,}/g, ' ').trim() || 'Untitled'
}

function sanitizeCandidate(value?: string): string {
  if (!value) return ''
  const v = value.replace(/\s+/g, ' ').trim()
  if (!v || v.length > 200) return ''
  return v
}

function isFilenameEcho(candidate: string, filename: string): boolean {
  const base = filename.replace(/\.[^.]+$/, '').toLowerCase()
  return candidate.toLowerCase() === base
}

function tidyTitle(raw: string): string {
  let t = raw.replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim()
  t = t.replace(/^["'“‘]+|["'”’]+$/g, '').trim()
  // Convert screaming ALL-CAPS titles to Title Case for readability.
  const letters = t.replace(/[^A-Za-z]/g, '')
  if (letters.length >= 4 && (t.match(/[A-Z]/g) || []).length / letters.length > 0.9) {
    t = titleCase(t.toLowerCase())
  }
  return t || 'Untitled'
}

function isTitleCased(line: string): boolean {
  const words = line.split(/\s+/).filter((w) => /[A-Za-z]/.test(w))
  if (words.length === 0) return false
  const SMALL = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'of', 'to', 'in', 'on', 'at', 'by', 'as', 'is'])
  let capped = 0
  for (const w of words) {
    if (SMALL.has(w.toLowerCase())) continue
    if (/^[A-Z0-9]/.test(w)) capped++
  }
  const significant = words.filter((w) => !SMALL.has(w.toLowerCase())).length || 1
  return capped / significant >= 0.7
}

function isTitleCasedOrSentence(line: string): boolean {
  return isTitleCased(line) || /^[A-Z]/.test(line)
}
