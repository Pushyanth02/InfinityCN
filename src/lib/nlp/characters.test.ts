import { describe, it, expect } from 'vitest'
import { transformOriginal } from '../pipeline/original'
import { analyzeCharacters, detectCharacters, buildCoOccurrence } from './characters'
import { detectScenes } from './scenes'
import {
  DIALOGUE_HEAVY, ALIASES, PRONOUNS, MULTI_PROTAGONIST, ALL_FIXTURES,
} from './__fixtures__/books'

/** Build the (paragraphs, sceneRanges) inputs the engine expects from raw text. */
function build(text: string) {
  const original = transformOriginal(text)
  const paras = original.paragraphs.map((p) => ({ text: p.text, startOffset: p.startOffset }))
  const segments = detectScenes(original.paragraphs)
  const ranges = segments.map((s) => ({ index: s.index, startOffset: s.startOffset, endOffset: s.endOffset }))
  return { paras, ranges }
}

describe('[unit] characters — detection', () => {
  it('detects attributed dialogue speakers', () => {
    const { paras, ranges } = build(DIALOGUE_HEAVY)
    const { characters } = analyzeCharacters(DIALOGUE_HEAVY, paras, ranges)
    const names = characters.map((c) => c.canonicalName)
    expect(names).toContain('Anna')
    expect(names).toContain('Ben')
  })

  it('never invents a character absent from the source text', () => {
    for (const text of Object.values(ALL_FIXTURES)) {
      const { paras, ranges } = build(text)
      const { characters } = analyzeCharacters(text, paras, ranges)
      for (const c of characters) {
        expect(text).toContain(c.canonicalName)
        for (const alias of c.aliases) expect(text).toContain(alias)
      }
    }
  })

  it('bounds importance and confidence scores to [0,100]', () => {
    const { paras, ranges } = build(MULTI_PROTAGONIST)
    const { characters } = analyzeCharacters(MULTI_PROTAGONIST, paras, ranges)
    for (const c of characters) {
      expect(c.importanceScore).toBeGreaterThanOrEqual(0)
      expect(c.importanceScore).toBeLessThanOrEqual(100)
      expect(c.confidenceScore).toBeGreaterThanOrEqual(0)
      expect(c.confidenceScore).toBeLessThanOrEqual(100)
    }
  })
})

describe('[unit] characters — alias & nickname resolution', () => {
  it('merges "Elizabeth", "Lizzy" and "Elizabeth Bennet" into one character', () => {
    const { paras, ranges } = build(ALIASES)
    const { characters } = analyzeCharacters(ALIASES, paras, ranges)
    const eliza = characters.find((c) => c.canonicalName === 'Elizabeth Bennet')
    expect(eliza).toBeDefined()
    expect(eliza!.aliases).toContain('Elizabeth')
    expect(eliza!.aliases).toContain('Lizzy')
    // Jane must remain a distinct character (different given name).
    expect(characters.some((c) => c.canonicalName === 'Jane')).toBe(true)
    expect(characters.filter((c) => c.canonicalName.includes('Elizabeth')).length).toBe(1)
  })
})

describe('[unit] characters — pronoun resolution', () => {
  it('resolves gendered pronouns to the nearest agreeing entity without inventing characters', () => {
    const { paras, ranges } = build(PRONOUNS)
    const { characters } = analyzeCharacters(PRONOUNS, paras, ranges)
    const sarah = characters.find((c) => c.canonicalName === 'Sarah')
    expect(sarah).toBeDefined()
    expect(sarah!.gender).toBe('FEMALE')
    expect(sarah!.resolvedPronounMentions).toBeGreaterThan(0)
    // No spurious entities created from pronouns.
    expect(characters.length).toBe(1)
  })
})

describe('[unit] characters — co-occurrence graph', () => {
  it('links characters that share scenes', () => {
    const { paras, ranges } = build(MULTI_PROTAGONIST)
    const { coOccurrence } = analyzeCharacters(MULTI_PROTAGONIST, paras, ranges)
    expect(coOccurrence.maxWeight).toBeGreaterThanOrEqual(1)
    for (const e of coOccurrence.edges) {
      expect(e.source < e.target).toBe(true) // deterministic ordering
      expect(e.weight).toBeGreaterThan(0)
    }
  })

  it('produces an empty graph when there are no scenes', () => {
    const graph = buildCoOccurrence([])
    expect(graph.edges).toEqual([])
    expect(graph.maxWeight).toBe(0)
  })
})

describe('[unit] characters — determinism', () => {
  it('produces byte-identical output for identical input', () => {
    const { paras, ranges } = build(DIALOGUE_HEAVY)
    const a = analyzeCharacters(DIALOGUE_HEAVY, paras, ranges)
    const b = analyzeCharacters(DIALOGUE_HEAVY, paras, ranges)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('returns no characters for empty input', () => {
    expect(detectCharacters('', [])).toEqual([])
  })
})
