import { describe, it, expect } from 'vitest'
import { tokenize, splitSentences, normalizeWhitespace, collapseHyphenation, isLikelyDialogue, syllableCount, computeStats, posLite } from './core'

describe('tokenize', () => {
  it('splits words and punctuation', () => {
    const tokens = tokenize('Hello, world! 42')
    expect(tokens.map((t) => t.text)).toEqual(['Hello', ',', ' ', 'world', '!', ' ', '42'])
  })
  it('handles accented characters', () => {
    expect(tokenize('café').filter((t) => t.type === 'word').map((t) => t.text)).toEqual(['café'])
  })
})

describe('splitSentences', () => {
  it('splits on period + capital', () => {
    expect(splitSentences('Hello world. Goodbye world.')).toHaveLength(2)
  })
  it('does not split after abbreviations', () => {
    expect(splitSentences('Mr. Smith went home.')).toHaveLength(1)
  })
  it('handles empty string', () => { expect(splitSentences('')).toEqual([]) })
})

describe('normalizeWhitespace', () => {
  it('collapses spaces', () => { expect(normalizeWhitespace('a   b')).toBe('a b') })
  it('trims', () => { expect(normalizeWhitespace('  hi  ')).toBe('hi') })
})

describe('collapseHyphenation', () => {
  it('joins line breaks', () => { expect(collapseHyphenation('exam-\nple')).toBe('example') })
})

describe('isLikelyDialogue', () => {
  it('detects quotes', () => { expect(isLikelyDialogue('"Hello," she said.')).toBe(true) })
  it('rejects narration', () => { expect(isLikelyDialogue('The sun set.')).toBe(false) })
})

describe('syllableCount', () => {
  it('counts syllables', () => { expect(syllableCount('hello')).toBe(2); expect(syllableCount('cat')).toBe(1) })
  it('handles empty', () => { expect(syllableCount('')).toBe(0) })
})

describe('computeStats', () => {
  it('computes stats', () => {
    const s = computeStats('The cat sat. The dog ran.')
    expect(s.wordCount).toBe(6); expect(s.sentenceCount).toBe(2)
  })
  it('handles empty', () => { expect(computeStats('').wordCount).toBe(0) })
})

describe('posLite', () => {
  it('tags pronouns', () => { expect(posLite('I')).toBe('PRP'); expect(posLite('she')).toBe('PRP') })
  it('tags modals', () => { expect(posLite('can')).toBe('MD') })
  it('tags determiners', () => { expect(posLite('the')).toBe('DT') })
  it('tags numbers', () => { expect(posLite('42')).toBe('CD') })
  it('tags -ing verbs', () => { expect(posLite('running')).toBe('VBG') })
  it('tags -ly adverbs', () => { expect(posLite('quickly')).toBe('RB') })
})
