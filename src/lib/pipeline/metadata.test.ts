import { describe, it, expect } from 'vitest'
import { transformOriginal } from './original'
import { detectDocumentMetadata, detectLanguageMulti } from './metadata'

/** Helper: build classified paragraphs the way the orchestrator does. */
function paras(text: string) {
  return transformOriginal(text, 'ignored-hint').paragraphs
}

describe('[unit] metadata — title detection priority chain', () => {
  it('prefers embedded document metadata over body headings (priority 1)', () => {
    const text = 'The Silent Sea\n\nIt was a dark and stormy night. The waves crashed hard.'
    const md = detectDocumentMetadata({
      text,
      paragraphs: paras(text),
      embedded: { title: 'The Real Embedded Title', author: 'Jane Doe' },
      filename: 'scan-0001.pdf',
    })
    expect(md.title).toBe('The Real Embedded Title')
    expect(md.titleSource).toBe('embedded')
    expect(md.author).toBe('Jane Doe')
  })

  it('rejects junk embedded titles and falls back to the first heading (priority 2)', () => {
    const text = 'The Silent Sea\n\nIt was a dark and stormy night. The waves crashed hard.'
    const md = detectDocumentMetadata({
      text,
      paragraphs: paras(text),
      embedded: { title: 'Microsoft Word - document1.docx' },
      filename: 'scan-0001.pdf',
    })
    expect(md.title).toBe('The Silent Sea')
    expect(md.titleSource).toBe('heading')
  })

  it('normalizes screaming ALL-CAPS titles to title case', () => {
    const text = 'MOBY DICK\n\nCall me Ishmael. Some years ago, never mind how long precisely.'
    const md = detectDocumentMetadata({ text, paragraphs: paras(text), filename: 'x.txt' })
    expect(md.title).toBe('Moby Dick')
  })

  it('falls back to a cleaned filename when no title signal exists (priority 5)', () => {
    const text =
      'It was the best of times, it was the worst of times, it was the age of wisdom.'
    const md = detectDocumentMetadata({
      text,
      paragraphs: paras(text),
      filename: 'great-expectations.txt',
    })
    expect(md.title).toBe('Great Expectations')
    expect(md.titleSource).toBe('filename')
  })

  it('uses the chapter label as the title for a single-chapter upload (Phase 3 regression)', () => {
    // The exact scenario from the bug report: a document that opens directly
    // with a chapter heading and has no separate title line. The title must
    // become the rendered chapter label — never duplicated, never malformed.
    const text =
      'Chapter 1: The Heart of a Demon Never Has Regret Even in Death\n\nThe morning light broke over the silent valley.'
    const md = detectDocumentMetadata({ text, paragraphs: paras(text), filename: 'demon-heart.pdf' })
    expect(md.title).toBe('Chapter 1: The Heart of a Demon Never Has Regret Even in Death')
    expect(md.titleSource).toBe('chapter')
  })

  it('never duplicates an identical chapter heading as the title', () => {
    const text =
      'Chapter 1\n\nChapter 1\n\nIt was a fine morning and the birds were singing.'
    const md = detectDocumentMetadata({ text, paragraphs: paras(text), filename: 'x.txt' })
    expect(md.title).toBe('Chapter 1')
  })
})

describe('[unit] metadata — author / chapters / series', () => {
  it('detects an explicit "by <Author>" line', () => {
    const text =
      'The Great Novel\n\nby Jane Austen\n\nChapter 1\n\nIt was a fine morning in spring.'
    const md = detectDocumentMetadata({ text, paragraphs: paras(text), filename: 'novel.txt' })
    expect(md.title).toBe('The Great Novel')
    expect(md.author).toBe('Jane Austen')
  })

  it('does not treat "by the time" as an author', () => {
    const text =
      'A Quiet Place\n\nBy the time the sun rose, everyone had already left the village.'
    const md = detectDocumentMetadata({ text, paragraphs: paras(text), filename: 'x.txt' })
    expect(md.author).toBeNull()
  })

  it('detects chapter headings', () => {
    const text =
      'The Journey\n\nChapter 1\n\nHe set out at dawn.\n\nChapter 2\n\nThe road was long.\n\nEpilogue\n\nHome at last.'
    const md = detectDocumentMetadata({ text, paragraphs: paras(text), filename: 'x.txt' })
    expect(md.chapterCount).toBeGreaterThanOrEqual(3)
    expect(md.chapters[0].title).toMatch(/Chapter 1/i)
    expect(md.chapters.some((c) => /Epilogue/i.test(c.title))).toBe(true)
  })

  it('uses the leading chapter label as the title for a single-chapter upload', () => {
    // Phase 3 scenario: a chapter whose heading carries a trailing title.
    // The document opens directly with the chapter marker and has no separate
    // book title — the chapter label "Chapter 1: <Title>" becomes the title,
    // never duplicated or malformed.
    const text =
      'Chapter 1: The Heart of a Demon Never Has Regret Even in Death\n\nThe old monk opened his eyes at dawn.'
    const md = detectDocumentMetadata({ text, paragraphs: paras(text), filename: 'x.txt' })
    expect(md.title).toBe('Chapter 1: The Heart of a Demon Never Has Regret Even in Death')
    expect(md.titleSource).toBe('chapter')
    expect(md.chapterCount).toBe(1)
  })

  it('does not duplicate the title when the heading repeats verbatim', () => {
    const text =
      'Chapter 1: The Awakening\n\nChapter 1: The Awakening\n\nShe rose from the bed, confused.'
    const md = detectDocumentMetadata({ text, paragraphs: paras(text), filename: 'x.txt' })
    expect(md.title).toBe('Chapter 1: The Awakening')
  })

  it('detects a series name in parenthetical notation', () => {
    const text =
      'The Winds of Winter\n\n(A Song of Ice and Fire #6)\n\nChapter 1\n\nThe cold came early.'
    const md = detectDocumentMetadata({ text, paragraphs: paras(text), filename: 'x.txt' })
    expect(md.series).toMatch(/Song of Ice and Fire/i)
  })
})

describe('[unit] metadata — reading stats', () => {
  it('reports a deterministic word count and reading time', () => {
    const text = Array.from({ length: 440 }, () => 'word').join(' ')
    const md = detectDocumentMetadata({ text, paragraphs: paras(text), filename: 'x.txt' })
    expect(md.wordCount).toBe(440)
    expect(md.readingTimeMin).toBe(2) // 440 / 220 wpm
  })
})

describe('[unit] metadata — language detection', () => {
  it('detects English', () => {
    expect(
      detectLanguageMulti(
        'The night was cold and the wind was strong, and it was clear that the storm had come to stay for the night.',
      ),
    ).toBe('en')
  })

  it('detects Spanish', () => {
    expect(
      detectLanguageMulti(
        'El niño caminaba por la calle y la casa estaba en el bosque, los pájaros cantaban con alegría en el árbol de la plaza.',
      ),
    ).toBe('es')
  })

  it('detects French', () => {
    expect(
      detectLanguageMulti(
        'Le petit chat dort sur le lit dans la maison, et les oiseaux chantent dans le jardin pendant que le chien court.',
      ),
    ).toBe('fr')
  })
})
