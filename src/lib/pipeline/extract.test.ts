import { describe, it, expect, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { extractText, detectLanguage, hashBuffer, hashText } from './extract'

const tempFiles: string[] = []
const tempDirs: string[] = []

async function writeTemp(name: string, content: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lemniscate-test-'))
  const p = path.join(dir, name)
  await fs.writeFile(p, content, 'utf-8')
  tempDirs.push(dir)
  tempFiles.push(p)
  return p
}

afterAll(async () => {
  for (const f of tempFiles) {
    await fs.unlink(f).catch(() => {})
  }
  for (const d of tempDirs) {
    await fs.rmdir(d).catch(() => {})
  }
})

describe('[unit] detectLanguage', () => {
  it('identifies predominantly English prose as "en"', () => {
    const text =
      'The cat and the dog ran to the house. It was a big house in the town, ' +
      'and it is that the sun was warm on the hill.'
    expect(detectLanguage(text)).toBe('en')
  })

  it('returns "unknown" for empty input', () => {
    expect(detectLanguage('')).toBe('unknown')
  })
})

describe('[unit] hashBuffer / hashText — content addressing', () => {
  it('produces the canonical SHA-256 digest', () => {
    // Known vector: sha256("abc")
    expect(hashBuffer(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('is deterministic and collision-distinct', () => {
    const a = hashBuffer(Buffer.from('lemniscate'))
    const b = hashBuffer(Buffer.from('lemniscate'))
    const c = hashBuffer(Buffer.from('Lemniscate'))
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })

  it('hashText matches hashBuffer for the same UTF-8 content', async () => {
    const text = 'The Last Lighthouse of Veyrn'
    expect(await hashText(text)).toBe(hashBuffer(Buffer.from(text, 'utf-8')))
  })
})

describe('[integration] extractText — TXT', () => {
  it('extracts plain text and computes accurate stats', async () => {
    const filePath = await writeTemp('sample.txt', 'Hello world.\nSecond line here.')
    const result = await extractText(filePath, 'text/plain')
    expect(result.extractor).toBe('txt')
    expect(result.text).toContain('Hello world')
    expect(result.text).toContain('Second line here')
    expect(result.wordCount).toBe(5)
    expect(result.charCount).toBeGreaterThan(0)
    expect(result.warnings).toEqual([])
  })

  it('strips a UTF-8 BOM if present', async () => {
    const filePath = await writeTemp('bom.txt', '\uFEFFContent after BOM.')
    const result = await extractText(filePath, 'text/plain')
    expect(result.text.startsWith('\uFEFF')).toBe(false)
    expect(result.text).toContain('Content after BOM')
  })
})
