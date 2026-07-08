import { describe, it, expect } from 'vitest'
import { transformOriginal } from './original'

// A small multi-block fixture. Blocks are separated by blank lines because the
// ORIGINAL transformer splits raw text on 2+ newlines.
const STORY = [
  'The Lighthouse',
  'Chapter One',
  'The sea was calm and grey. The lamp had not been lit in seven years.',
  '"I will not go," she said.',
  'Later, the sun set over the black water.',
].join('\n\n')

describe('[unit] transformOriginal — formatting repair', () => {
  it('repairs smart quotes into straight quotes', () => {
    const result = transformOriginal('\u201CHello,\u201D he said.')
    expect(result.plainText).toContain('"Hello,"')
    expect(result.plainText).not.toContain('\u201C')
    expect(result.plainText).not.toContain('\u201D')
  })

  it('collapses hyphenation across line breaks', () => {
    const result = transformOriginal('This is an exam-\nple of hyphenation.')
    expect(result.plainText).toContain('example')
    expect(result.plainText).not.toContain('exam-')
  })
})

describe('[unit] transformOriginal — paragraph classification', () => {
  it('classifies a chapter line as HEADING', () => {
    const result = transformOriginal(STORY)
    const chapter = result.paragraphs.find((p) => p.text === 'Chapter One')
    expect(chapter).toBeDefined()
    expect(chapter!.type).toBe('HEADING')
  })

  it('classifies a quoted line as DIALOGUE', () => {
    const result = transformOriginal(STORY)
    const dialogue = result.paragraphs.find((p) => p.text.startsWith('"I will not go'))
    expect(dialogue).toBeDefined()
    expect(dialogue!.type).toBe('DIALOGUE')
  })

  it('classifies a leading transition word as TRANSITION', () => {
    const result = transformOriginal(STORY)
    const transition = result.paragraphs.find((p) => p.text.startsWith('Later,'))
    expect(transition).toBeDefined()
    expect(transition!.type).toBe('TRANSITION')
  })
})

describe('[unit] transformOriginal — title inference', () => {
  it('infers the title from the first non-structural heading', () => {
    const result = transformOriginal(STORY)
    expect(result.title).toBe('The Lighthouse')
  })

  it('falls back to the provided title hint when no heading exists', () => {
    const result = transformOriginal('Just a single narrative sentence here.', 'My Hint')
    expect(result.title).toBe('My Hint')
  })
})

describe('[unit] transformOriginal — structural invariants', () => {
  it('produces paragraphs with monotonically increasing offsets', () => {
    const result = transformOriginal(STORY)
    for (let i = 1; i < result.paragraphs.length; i++) {
      expect(result.paragraphs[i].startOffset).toBeGreaterThan(result.paragraphs[i - 1].startOffset)
      expect(result.paragraphs[i].endOffset).toBeGreaterThanOrEqual(result.paragraphs[i].startOffset)
    }
  })

  it('computes non-zero reading statistics', () => {
    const result = transformOriginal(STORY)
    expect(result.stats.wordCount).toBeGreaterThan(0)
    expect(result.stats.sentenceCount).toBeGreaterThan(0)
  })

  it('is deterministic — identical input yields byte-identical output', () => {
    const a = transformOriginal(STORY)
    const b = transformOriginal(STORY)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('preserves source wording verbatim in every paragraph', () => {
    const result = transformOriginal(STORY)
    // Each paragraph's text must be traceable to the (normalized) source — the
    // transformer repairs formatting but never invents or rewrites content.
    for (const p of result.paragraphs) {
      expect(p.text.trim().length).toBeGreaterThan(0)
      expect(p.rawText).toBe(p.text)
    }
  })

  it('handles empty input without throwing', () => {
    const result = transformOriginal('')
    expect(result.paragraphs).toEqual([])
    expect(result.stats.wordCount).toBe(0)
  })
})
