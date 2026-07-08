/**
 * Lemniscate — Deterministic NLP Core
 * ----------------------------------------------------------------------------
 * Classical, offline, rule-based NLP primitives. NO machine learning, NO
 * neural models, NO statistical embeddings. Everything here is deterministic
 * and reproducible.
 *
 * Primitives:
 *   - tokenize: word/punctuation tokenization
 *   - splitSentences: rule-based sentence segmentation
 *   - normalizeWhitespace
 *   - isLikelyDialogue / extractDialogue
 *   - posLite: a tiny part-of-speech tagger (deterministic regex rules)
 *   - capitalize / titleCase
 *   - readability stats (Flesch-Kincaid, sentence/word length)
 */

// ---------------------------------------------------------------------------
// Tokenization
// ---------------------------------------------------------------------------

export interface Token {
  text: string
  type: 'word' | 'punct' | 'space' | 'number' | 'symbol'
  lower: string
  start: number
  end: number
}

const TOKEN_RE = /([A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ''\-]*)|([0-9][0-9.,:]*)|(\s+)|([.,;:!?"'“”‘’()\[\]—–-])/g

export function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let m: RegExpExecArray | null
  TOKEN_RE.lastIndex = 0
  let last = 0
  while ((m = TOKEN_RE.exec(input)) !== null) {
    if (m.index > last) {
      tokens.push({
        text: input.slice(last, m.index),
        type: 'symbol',
        lower: input.slice(last, m.index).toLowerCase(),
        start: last,
        end: m.index,
      })
    }
    const text = m[0]
    let type: Token['type'] = 'word'
    if (m[2]) type = 'number'
    else if (m[3]) type = 'space'
    else if (m[4]) type = 'punct'
    tokens.push({
      text,
      type,
      lower: text.toLowerCase(),
      start: m.index,
      end: m.index + text.length,
    })
    last = m.index + text.length
  }
  if (last < input.length) {
    tokens.push({
      text: input.slice(last),
      type: 'symbol',
      lower: input.slice(last).toLowerCase(),
      start: last,
      end: input.length,
    })
  }
  return tokens
}

export function wordTokens(input: string): string[] {
  return tokenize(input)
    .filter((t) => t.type === 'word')
    .map((t) => t.lower)
}

// ---------------------------------------------------------------------------
// Sentence segmentation (rule-based)
// ---------------------------------------------------------------------------

const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'rev', 'hon', 'capt',
  'lt', 'col', 'gen', 'sgt', 'pvt', 'cpl', 'inc', 'ltd', 'co', 'corp',
  'etc', 'vs', 'viz', 'e.g', 'i.e', 'a.m', 'p.m', 'no', 'vol', 'pp',
  'ch', 'sec', 'fig', 'eq', 'al', 'approx', 'dept', 'est', 'min', 'max',
])

const TITLE_CASE_ABBR = new Set([
  'Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Sr.', 'Jr.', 'St.', 'Rev.',
  'Capt.', 'Lt.', 'Col.', 'Gen.', 'Sgt.', 'Inc.', 'Ltd.', 'Co.', 'Corp.',
  'No.', 'Vol.', 'Dept.',
])

/**
 * Split text into sentences using a deterministic single-pass state machine.
 *   1. Track preceding word as we scan forward (no backward lookups).
 *   2. Don't split after known abbreviations.
 *   3. Don't split on decimals (3.14) or numbered lists (1. ...).
 *   4. Respect quotation marks at end of sentence.
 *
 * O(n) single pass — replaces the previous O(n²) backward-scanning approach.
 */
export function splitSentences(text: string): { text: string; start: number; end: number }[] {
  const sentences: { text: string; start: number; end: number }[] = []
  if (!text || !text.trim()) return sentences

  const n = text.length
  let start = 0
  let wordStart = -1
  let inWord = false

  for (let i = 0; i < n; i++) {
    const ch = text[i]

    // Track word boundaries for abbreviation lookup
    if (/[A-Za-z]/.test(ch)) {
      if (!inWord) { wordStart = i; inWord = true }
    } else {
      inWord = false
    }

    // Only sentence terminators trigger boundary logic
    if (ch !== '.' && ch !== '!' && ch !== '?') continue

    // Skip decimals: digit.digit (e.g. 3.14)
    if (ch === '.' && i > 0 && i + 1 < n && /\d/.test(text[i - 1]) && /\d/.test(text[i + 1])) continue
    // Skip numbered list markers: "1. item"
    if (ch === '.' && i > 0 && /\d/.test(text[i - 1])) {
      let j = i + 1
      while (j < n && /\s/.test(text[j])) j++
      if (j < n && /[a-z]/.test(text[j])) continue
    }

    // Scan forward past trailing punctuation and whitespace
    let j = i + 1
    while (j < n && /[.!?;:'"‘’“”)}]]/.test(text[j])) j++
    if (j >= n) continue
    if (!/\s/.test(text[j])) continue
    let k = j
    while (k < n && /\s/.test(text[k])) k++
    if (k >= n) continue

    const next = text[k]
    // Lowercase continuation after terminator is NOT a sentence boundary
    if (!/[A-Z"‘“(]/.test(next)) continue

    // Abbreviation check using tracked word
    if (ch === '.') {
      if (wordStart >= 0 && inWord) {
        const word = text.slice(wordStart, i).toLowerCase()
        if (ABBREVIATIONS.has(word)) continue
        if (word.length === 1 && /[a-z]/.test(word)) continue
      } else {
        // Fallback backward scan (only when word tracking missed it)
        let w2 = i - 1
        while (w2 >= 0 && /[A-Za-z.]/.test(text[w2])) w2--
        const word2 = text.slice(w2 + 1, i).toLowerCase()
        if (ABBREVIATIONS.has(word2)) continue
        if (word2.length === 1 && /[a-z]/.test(word2)) continue
      }
    }

    // Sentence boundary confirmed
    let end = i + 1
    while (end < n && /[.!?;:'"‘’“”)}]]/.test(text[end])) end++
    const chunk = text.slice(start, end).trim()
    if (chunk) {
      sentences.push({ text: chunk, start, end })
    }
    while (end < n && /\s/.test(text[end])) end++
    start = end
    i = end - 1 // loop increment will set i to end
  }

  const tail = text.slice(start).trim()
  if (tail) sentences.push({ text: tail, start, end: text.length })
  return sentences
}

// ---------------------------------------------------------------------------
// Whitespace & formatting normalization
// ---------------------------------------------------------------------------

export function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\u2007/g, ' ')
    .replace(/\u2028|\u2029/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/^[ \t]+/gm, '')
    .trim()
}

export function collapseHyphenation(input: string): string {
  return input.replace(/([A-Za-z])-\n([A-Za-z])/g, '$1$2')
}

export function repairSmartQuotes(input: string): string {
  return input
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2013|\u2014/g, '—')
    .replace(/\u2026/g, '...')
}

// ---------------------------------------------------------------------------
// Dialogue detection
// ---------------------------------------------------------------------------

const DIALOGUE_OPENERS = /^["“']/
const DIALOGUE_CLOSERS = /["”']\s*$/

export function isLikelyDialogue(text: string): boolean {
  const t = text.trim()
  if (t.length < 2) return false
  if (DIALOGUE_OPENERS.test(t)) return true
  if (DIALOGUE_CLOSERS.test(t) && /["“']/.test(t)) return true
  if (/\b(said|says|asked|replied|whispered|shouted|cried|murmured|growled|snapped|added|continued|remarked|exclaimed)\b/i.test(t)) {
    if (/[,"—]\s*$/.test(t) || /^["“']/.test(t)) return true
  }
  return false
}

export interface DialogueSpan {
  text: string
  start: number
  end: number
  speaker?: string
  attribution?: string
}

/** Extract quoted dialogue spans from a paragraph. */
export function extractDialogue(text: string): DialogueSpan[] {
  const spans: DialogueSpan[] = []
  // Match matched quote pairs (straight or curly), never mixing opening/closing types.
  const re = /(?:\"([^\"]*?)\"|“([^”]*?)”)/g
  let m: RegExpExecArray | null
  // Speaker pattern: honorific + name, OR multi-word proper name (e.g. "Mr. Darcy",
  // "Elizabeth Bennet"), followed by an attribution verb.
  const speakerPat = '((?:(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Rev|Capt|Lt|Col|Gen|Sgt|Sir|Lady|Lord|King|Queen|Prince|Princess|Duke|Duchess|Earl|Count|Countess)\\.?\\s+)?[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2})'
  const verbList = 'said|asked|replied|whispered|shouted|cried|murmured|growled|snapped|added|continued|remarked|exclaimed|answered|called|spoke|uttered|declared|announced|muttered|mumbled|bellowed|roared|hissed|sneered|sighed|chuckled|laughed|giggled|sobbed|wept|wailed|howled|sang|chanted|prayed|vowed|promised'
  const attrAfterRe = new RegExp(`^[\\s,]*${speakerPat}\\s+(?:${verbList})`)
  const attrBeforeRe = new RegExp(`${speakerPat}\\s+(?:${verbList})[\\s,:]*$`)
  while ((m = re.exec(text)) !== null) {
    const _inner = m[1] ?? m[2] ?? ''
    const fullMatch = m[0]
    const span: DialogueSpan = {
      text: fullMatch,
      start: m.index,
      end: m.index + fullMatch.length,
    }
    const after = text.slice(m.index + fullMatch.length, m.index + fullMatch.length + 80)
    const attr = after.match(attrAfterRe)
    if (attr) {
      span.speaker = attr[1].trim()
      span.attribution = attr[0].trim()
    } else {
      const before = text.slice(Math.max(0, m.index - 60), m.index)
      const attrB = before.match(attrBeforeRe)
      if (attrB) {
        span.speaker = attrB[1].trim()
        span.attribution = attrB[0].trim()
      }
    }
    spans.push(span)
  }
  return spans
}

// ---------------------------------------------------------------------------
// Tiny deterministic POS tagger (regex rules; not a model)
// ---------------------------------------------------------------------------

export type PosTag =
  | 'NN' | 'NNS' | 'NNP' | 'NNPS'
  | 'VB' | 'VBD' | 'VBG' | 'VBN' | 'VBP' | 'VBZ'
  | 'JJ' | 'JJR' | 'JJS'
  | 'RB' | 'RBR' | 'RBS'
  | 'PRP' | 'PRP$'
  | 'DT' | 'IN' | 'CC'
  | 'UH'
  | 'CD'
  | 'MD'
  | 'OTHER'

const PRONOUNS = new Set(['i','you','he','she','it','we','they','me','him','her','us','them'])
const PRONOUNS_POSS = new Set(['my','your','his','her','its','our','their','mine','yours','hers','ours','theirs'])
const MODALS = new Set(['can','could','may','might','must','shall','should','will','would','ought','need','dare'])
const DETS = new Set(['the','a','an','this','that','these','those','some','any','no','every','each','all','both','either','neither','another','such'])
const CONJS = new Set(['and','but','or','nor','yet','so','for','although','because','since','unless','while','whereas','if','though'])
const INTERJECTIONS = new Set(['oh','ah','wow','hey','alas','hmm','ouch','woah','whoa','ugh','huh','shh','psst','aha','ooh','yahoo'])
const IRREGULAR_PAST = new Set(['was','were','had','did','said','went','came','saw','made','took','gave','got','found','told','knew','thought','felt','became','left','put','brought','began','kept','held','wrote','stood','heard','let','meant','met','ran','paid','sat','read','fell','lost','sent','spent','spoke','rang','sang','woke','wore','drove','flew','grew','threw','blew','knew','bore','tore','swore','arose','ate','drank','slept','swept','wept','crept','knelt','dealt','dreamt','burnt','learnt','spelt','spilt','spoilt'])

const VBG_SUFFIX = /^[a-z]+ing$/
const VBN_SUFFIX = /^[a-z]+ed$/

export function posLite(word: string, prevWord?: string): PosTag {
  const w = word.toLowerCase()
  if (/^\d+(\.\d+)?$/.test(w)) return 'CD'
  if (PRONOUNS_POSS.has(w)) return 'PRP$'
  if (PRONOUNS.has(w)) return 'PRP'
  if (MODALS.has(w)) return 'MD'
  if (DETS.has(w)) return 'DT'
  if (CONJS.has(w)) return 'CC'
  if (INTERJECTIONS.has(w)) return 'UH'
  if (/^[A-Z]/.test(word) && prevWord && !/[.!?]$/.test(prevWord)) {
    return word.endsWith('s') && /^[A-Z][a-z]+s$/.test(word) ? 'NNPS' : 'NNP'
  }
  if (IRREGULAR_PAST.has(w)) return 'VBD'
  if (VBG_SUFFIX.test(w) && w.length > 4) return 'VBG'
  if (VBN_SUFFIX.test(w) && w.length > 3) return 'VBN'
  if (w.endsWith('ly') && w.length > 3) return 'RB'
  if (w.endsWith('ness') || w.endsWith('ment') || w.endsWith('tion') || w.endsWith('ship') || w.endsWith('hood') || w.endsWith('ity')) return 'NN'
  if (w.endsWith('ful') || w.endsWith('ous') || w.endsWith('ive') || w.endsWith('able') || w.endsWith('ible') || w.endsWith('al') || w.endsWith('ish')) return 'JJ'
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) return 'NNS'
  return 'NN'
}

// ---------------------------------------------------------------------------
// Text statistics & readability
// ---------------------------------------------------------------------------

const SYL_VOWEL_GROUPS = /[aeiouy]+/g

export function syllableCount(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  if (w.length <= 3) return 1
  let count = (w.match(SYL_VOWEL_GROUPS) || []).length
  if (w.endsWith('e')) count -= 1
  if (w.endsWith('le') && w.length > 2 && !/[aeiouy]/.test(w[w.length - 3])) count += 1
  if (count < 1) count = 1
  return count
}

export interface TextStats {
  charCount: number
  wordCount: number
  sentenceCount: number
  paragraphCount: number
  avgWordsPerSentence: number
  avgSyllablesPerWord: number
  fleschReadingEase: number
  fleschKincaidGrade: number
  readingTimeMin: number
}

export function computeStats(text: string): TextStats {
  const charCount = text.length
  const words = wordTokens(text)
  const wordCount = words.length
  const sentences = splitSentences(text)
  const sentenceCount = Math.max(1, sentences.length)
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0)
  const paragraphCount = Math.max(1, paragraphs.length)
  const syl = words.reduce((a, w) => a + syllableCount(w), 0)
  const avgWordsPerSentence = wordCount / sentenceCount
  const avgSyllablesPerWord = wordCount > 0 ? syl / wordCount : 0
  const fleschReadingEase = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord
  const fleschKincaidGrade = 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59
  const readingTimeMin = wordCount > 0 ? Math.max(1, Math.round(wordCount / 220)) : 0
  return {
    charCount,
    wordCount,
    sentenceCount,
    paragraphCount,
    avgWordsPerSentence: round1(avgWordsPerSentence),
    avgSyllablesPerWord: round2(avgSyllablesPerWord),
    fleschReadingEase: round1(fleschReadingEase),
    fleschKincaidGrade: round1(fleschKincaidGrade),
    readingTimeMin,
  }
}

function round1(x: number): number {
  return Math.round(x * 10) / 10
}
function round2(x: number): number {
  return Math.round(x * 100) / 100
}

// ---------------------------------------------------------------------------
// Casing helpers
// ---------------------------------------------------------------------------

export function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function titleCase(s: string): string {
  const SMALL = new Set(['a','an','the','and','but','or','nor','for','yet','so','as','at','by','in','of','on','to','up','per','via','de','la','le','du','von','van'])
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : capitalize(w)))
    .join(' ')
}

export { ABBREVIATIONS, TITLE_CASE_ABBR }
