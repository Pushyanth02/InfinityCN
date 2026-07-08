/**
 * Lemniscate — ORIGINAL MODE Transformer
 * Preserve source meaning. Repair formatting. Reconstruct proper paragraphs.
 */
import { normalizeWhitespace, collapseHyphenation, repairSmartQuotes, splitSentences, isLikelyDialogue, extractDialogue, computeStats } from '../nlp/core'

export interface OriginalParagraph {
  index: number; text: string; rawText: string;
  type: 'NARRATION' | 'DIALOGUE' | 'ACTION' | 'TRANSITION' | 'HEADING' | 'THOUGHT';
  speaker?: string; wordCount: number; charCount: number; startOffset: number; endOffset: number;
}

export interface OriginalResult {
  title: string; content: string; plainText: string;
  paragraphs: OriginalParagraph[]; stats: ReturnType<typeof computeStats>; transforms: string[];
}

const HEADING_RE = /^(#{1,6}\s+|chapter\s+(?:\d+|[ivxlcdm]+|[a-z]+)|prologue|epilogue|part\s+(?:\d+|[ivxlcdm]+|[a-z]+)|book\s+(?:\d+|[ivxlcdm]+)|act\s+\d+|scene\s+\d+|introduction|preface|foreword|afterword|appendix)/i
const ALLCAPS_HEADING_RE = /^[A-Z0-9][A-Z0-9 .:'\-&]{2,80}$/
const TITLE_LINE_RE = /^[A-Z][A-Za-z''\-:. ]{2,80}$/
const TRANSITION_RE = /^(later|meanwhile|afterwards|soon|suddenly|eventually|the next day|the following morning|hours later|moments later|days later|weeks later|months later|years later|by the time|in time|finally|at last)[\s,]/i
const THOUGHT_RE = /(^|\s)(he|she|i|they|we|you) (thought|wondered|realized|imagined|dreamed|remembered|recalled|feared|hoped|wished|pondered|mused|reflected|considered)\b/i
const ACTION_VERBS = /\b(ran|jumped|leapt|grabbed|struck|fell|drew|slammed|threw|lunged|sprang|dashed|rushed|charged|climbed|crawled|ducked|dodged|swung|slashed|punched|kicked|blocked|parried|rolled|spun|whirled|seized|clutched|wrenched|pulled|pushed|lifted|dropped|smashed|crashed|burst|bolted|sprinted)\b/i

export function transformOriginal(rawText: string, titleHint?: string): OriginalResult {
  const transforms: string[] = []
  let text = rawText
  text = repairSmartQuotes(text)
  text = collapseHyphenation(text)
  text = normalizeWhitespace(text)
  transforms.push('Repaired encoding, smart quotes, and whitespace.')

  const rawBlocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
  const isStandalone = (s: string) => HEADING_RE.test(s) || ALLCAPS_HEADING_RE.test(s) || (s.split(/\s+/).length <= 12 && TITLE_LINE_RE.test(s) && !/[.!?]$/.test(s))
  const merged: string[] = []
  for (const cur of rawBlocks) {
    const last = merged[merged.length - 1]
    if (last && !/[.!?]["'"'\]\}]?$/.test(last) && !isStandalone(cur) && !isStandalone(last)) merged[merged.length - 1] = `${last} ${cur}`
    else merged.push(cur)
  }
  const split: string[] = []
  for (const block of merged) {
    if (HEADING_RE.test(block) || ALLCAPS_HEADING_RE.test(block)) { split.push(block); continue }
    const sentences = splitSentences(block)
    if (sentences.length <= 6) { split.push(block); continue }
    const markers = findTopicShifts(sentences.map((s) => s.text))
    if (markers.length === 0) { split.push(block); continue }
    let prev = 0
    for (const idx of markers) { const chunk = sentences.slice(prev, idx).map((s) => s.text).join(' '); if (chunk.trim()) split.push(chunk.trim()); prev = idx }
    const tail = sentences.slice(prev).map((s) => s.text).join(' ')
    if (tail.trim()) split.push(tail.trim())
  }

  let offset = 0
  const paragraphs: OriginalParagraph[] = split.map((text, index) => {
    const type = classifyParagraph(text)
    const words = text.split(/\s+/).filter(Boolean)
    const dialogue = type === 'DIALOGUE' ? extractDialogue(text) : []
    const speaker = dialogue.find((d) => d.speaker)?.speaker
    const para = { index, text, rawText: text, type, speaker, wordCount: words.length, charCount: text.length, startOffset: offset, endOffset: offset + text.length }
    offset += text.length + 2
    return para
  })

  const mdLines: string[] = []
  // An explicit hint (the detected metadata title) is authoritative when given;
  // inferTitle is the fallback for standalone calls without a hint.
  const title = titleHint?.trim() || inferTitle(paragraphs) || 'Untitled Narrative'
  mdLines.push(`# ${title}`, '')
  for (const p of paragraphs) {
    if (p.type === 'HEADING') mdLines.push(`## ${p.text.replace(/^#+\s*/, '')}`, '')
    else if (p.type === 'DIALOGUE') mdLines.push(`> ${p.text}`, '')
    else if (p.type === 'TRANSITION') mdLines.push(`*${p.text}*`, '')
    else mdLines.push(p.text, '')
  }
  const stats = computeStats(paragraphs.map((p) => p.text).join('\n\n'))
  return { title, content: mdLines.join('\n').trim(), plainText: paragraphs.map((p) => p.text).join('\n\n'), paragraphs, stats, transforms }
}

function classifyParagraph(text: string): OriginalParagraph['type'] {
  const t = text.trim()
  const wc = t.split(/\s+/).length
  if (HEADING_RE.test(t)) return 'HEADING'
  if (ALLCAPS_HEADING_RE.test(t) && wc <= 12) return 'HEADING'
  if (wc <= 12 && TITLE_LINE_RE.test(t) && !/[.!?]$/.test(t) && !isLikelyDialogue(t)) return 'HEADING'
  if (TRANSITION_RE.test(t)) return 'TRANSITION'
  if (isLikelyDialogue(t)) return 'DIALOGUE'
  if (THOUGHT_RE.test(t)) return 'THOUGHT'
  const sentences = splitSentences(t)
  if (sentences.length <= 3 && ACTION_VERBS.test(t)) return 'ACTION'
  return 'NARRATION'
}

function findTopicShifts(sentences: string[]): number[] {
  const leaders = new Set(['meanwhile','later','afterward','afterwards','soon','eventually','finally','suddenly','moments','hours','days','weeks','months','years','the next','the following','by the time','when','once','after','before','as','while','although','though','however','nevertheless','still','yet','but','now','then'])
  const shifts: number[] = []
  for (let i = 1; i < sentences.length; i++) {
    const first = (sentences[i].split(/\s+/)[0] || '').toLowerCase().replace(/[^a-z]/g, '')
    if (leaders.has(first) && /[.!?]$/.test(sentences[i - 1].trim())) shifts.push(i)
  }
  return shifts
}

function inferTitle(paragraphs: OriginalParagraph[]): string {
  const structural = /^(chapter\s+|prologue|epilogue|part\s+|book\s+|act\s+|scene\s+|introduction|preface|foreword|afterword|appendix)/i
  for (const p of paragraphs) {
    if (p.type === 'HEADING' && p.wordCount <= 12 && !structural.test(p.text.trim())) return p.text.replace(/^#+\s*/, '').trim()
  }
  const titleRe = /^[A-Z][A-Za-z''\-:. ]{2,80}$/
  for (const p of paragraphs) {
    const t = p.text.trim()
    if (p.wordCount <= 12 && p.wordCount >= 2 && titleRe.test(t) && !/[.!?]$/.test(t) && !structural.test(t)) return t
  }
  return ''
}
