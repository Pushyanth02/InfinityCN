/**
 * Lemniscate — Document Type Detection
 * ----------------------------------------------------------------------------
 * Deterministic heuristic detection of the high-level document category.
 */

import type { DocumentType } from '@/lib/domain/enums'
import type { CanonicalDocument, CanonicalParagraph } from './types'

const NOVEL_SIGNALS = [
  /\bchapter\s+(?:\d+|[ivxlcdm]+|[a-z]+)\b/i,
  /\bprologue\b/i,
  /\bepilogue\b/i,
  /\bpart\s+(?:\d+|[ivxlcdm]+|[a-z]+)\b/i,
]

const RESEARCH_SIGNALS = [
  /\babstract\b/i,
  /\bkeywords?\b/i,
  /\breferences?\b/i,
  /\bbibliography\b/i,
  /\bdoi\b/i,
  /\barxiv\b/i,
  /\bISSN\b/i,
  /\bmethodology\b/i,
  /\bresults?\s+and\s+discussion\b/i,
  /\bet\.?\s*al\.?\b/i,
  /^\s*\[\d+\]\s/gm,
  /^\s*\(\d{4}\)/gm,
]

const LEGAL_SIGNALS = [
  /\bwhereas\b/i,
  /\bhereby\b/i,
  /\bnotwithstanding\b/i,
  /\bparty\s+(?:of\s+the\s+)?(?:first|second)\s+part\b/i,
  /\bsection\s+\d+/i,
  /\bsubsection\s+\d+/i,
  /\barticle\s+\d+/i,
  /\bclause\s+\d+/i,
  /\bherein\b/i,
  /\baforementioned\b/i,
  /\bstatute\b/i,
  /\bjurisdiction\b/i,
]

const TECHNICAL_SIGNALS = [
  /\bAPI\b/i,
  /\bendpoint\b/i,
  /\bconfiguration\b/i,
  /\bdeployment\b/i,
  /\binstallation\b/i,
  /\btroubleshoot/i,
  /\bstep\s+\d+/i,
  /\bprerequisites?\b/i,
  /\bsystem\s+requirements?\b/i,
  /\bversion\s+\d+\.\d+/i,
]

const MANUAL_SIGNALS = [
  /\btable\s+of\s+contents?\b/i,
  /\binstructions?\b/i,
  /\bwarning\b/i,
  /\bcaution\b/i,
  /\bdanger\b/i,
  /\bnote\b/i,
  /\bsafety\b/i,
  /\bwarranty\b/i,
]

const REPORT_SIGNALS = [
  /\bexecutive\s+summary\b/i,
  /\bfindings?\b/i,
  /\brecommendations?\b/i,
  /\bconclusions?\b/i,
  /\bappendix\b/i,
  /\bQ[1-4]\s+\d{4}/i,
]

const EDUCATIONAL_SIGNALS = [
  /\bexercise\b/i,
  /\bpractice\b/i,
  /\bhomework\b/i,
  /\blesson\b/i,
  /\bquiz\b/i,
  /\breview\s+questions?\b/i,
  /\blearning\s+objectives?\b/i,
  /\bchapter\s+summary\b/i,
]

interface DetectionScore {
  type: DocumentType
  score: number
}

function countSignals(text: string, patterns: RegExp[]): number {
  let count = 0
  for (const re of patterns) {
    re.lastIndex = 0
    if (re.test(text)) count++
  }
  return count
}

export function detectDocumentType(doc: CanonicalDocument): DocumentType
export function detectDocumentType(text: string, paragraphs?: CanonicalParagraph[]): DocumentType
export function detectDocumentType(
  docOrText: CanonicalDocument | string,
  paragraphs?: CanonicalParagraph[],
): DocumentType {
  const text = typeof docOrText === 'string' ? docOrText : docOrText.rawText
  const sample = text.slice(0, 8000)

  const scores: DetectionScore[] = [
    { type: 'NOVEL', score: countSignals(sample, NOVEL_SIGNALS) },
    { type: 'RESEARCH_PAPER', score: countSignals(sample, RESEARCH_SIGNALS) },
    { type: 'LEGAL_DOCUMENT', score: countSignals(sample, LEGAL_SIGNALS) },
    { type: 'TECHNICAL_DOC', score: countSignals(sample, TECHNICAL_SIGNALS) },
    { type: 'MANUAL', score: countSignals(sample, MANUAL_SIGNALS) },
    { type: 'REPORT', score: countSignals(sample, REPORT_SIGNALS) },
    { type: 'EDUCATIONAL', score: countSignals(sample, EDUCATIONAL_SIGNALS) },
  ]

  scores.sort((a, b) => b.score - a.score || a.type.localeCompare(b.type))

  const best = scores[0]
  if (!best || best.score < 2) return 'GENERAL'

  if (best.type === 'NOVEL' && paragraphs) {
    const headingCount = paragraphs.filter((p) => p.type === 'HEADING').length
    const totalWords = paragraphs.reduce((s, p) => s + p.wordCount, 0)
    if (headingCount >= 3 && totalWords > 5000) {
      return totalWords > 40000 ? 'NOVEL' : 'NOVELLA'
    }
    if (totalWords < 7500 && headingCount <= 2) {
      return 'SHORT_STORY'
    }
  }

  return best.type
}