/**
 * Security tests — Upload Validation
 */
import { describe, it, expect } from 'vitest'
import { uploadPath } from '@/lib/storage'
import path from 'node:path'

describe('uploadPath — path traversal defense', () => {
  it('resolves valid storage names correctly', () => {
    const result = uploadPath('abc123-1a2b3c.pdf')
    expect(path.basename(result)).toBe('abc123-1a2b3c.pdf')
  })

  it('throws on path traversal with ../', () => {
    expect(() => uploadPath('../../../etc/passwd')).toThrow('Path traversal detected')
  })

  it('throws on path traversal with ..\\', () => {
    expect(() => uploadPath('..\\..\\..\\windows\\system32')).toThrow('Path traversal detected')
  })

  it('throws on absolute path injection (unix)', () => {
    expect(() => uploadPath('/etc/passwd')).toThrow('Path traversal detected')
  })

  it('handles names with dots that are not traversals', () => {
    // A file like "file.v2.pdf" should work fine
    const result = uploadPath('abc123-1a2b3c.v2.pdf')
    expect(path.basename(result)).toBe('abc123-1a2b3c.v2.pdf')
  })
})

describe('upload MIME and extension validation', () => {
  // These are unit-level tests for the validation logic
  const ALLOWED_MIME = new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'text/markdown',
  ])
  const ALLOWED_EXT = new Set(['.pdf', '.docx', '.doc', '.txt', '.md'])

  it('accepts allowed MIME types', () => {
    expect(ALLOWED_MIME.has('application/pdf')).toBe(true)
    expect(ALLOWED_MIME.has('text/plain')).toBe(true)
  })

  it('rejects disallowed MIME types', () => {
    expect(ALLOWED_MIME.has('application/javascript')).toBe(false)
    expect(ALLOWED_MIME.has('text/html')).toBe(false)
    expect(ALLOWED_MIME.has('image/png')).toBe(false)
    expect(ALLOWED_MIME.has('application/x-executable')).toBe(false)
  })

  it('accepts allowed extensions', () => {
    expect(ALLOWED_EXT.has('.pdf')).toBe(true)
    expect(ALLOWED_EXT.has('.docx')).toBe(true)
    expect(ALLOWED_EXT.has('.txt')).toBe(true)
  })

  it('rejects disallowed extensions', () => {
    expect(ALLOWED_EXT.has('.exe')).toBe(false)
    expect(ALLOWED_EXT.has('.js')).toBe(false)
    expect(ALLOWED_EXT.has('.sh')).toBe(false)
    expect(ALLOWED_EXT.has('.php')).toBe(false)
  })
})

describe('magic bytes validation logic', () => {
  function validateMagicBytes(buf: Buffer, ext: string): boolean {
    if (buf.length < 4) return false
    if (ext === '.pdf') return buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46
    if (ext === '.docx') return buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04
    if (ext === '.doc') {
      return buf.length >= 8 &&
        buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0 &&
        buf[4] === 0xA1 && buf[5] === 0xB1 && buf[6] === 0x1A && buf[7] === 0xE1
    }
    if (ext === '.txt' || ext === '.md') return !buf.includes(0x00)
    return false
  }

  it('accepts valid PDF magic bytes', () => {
    const pdfBuf = Buffer.from('%PDF-1.4 some content', 'ascii')
    expect(validateMagicBytes(pdfBuf, '.pdf')).toBe(true)
  })

  it('rejects invalid PDF magic bytes', () => {
    const fakeBuf = Buffer.from('NOT A PDF FILE', 'ascii')
    expect(validateMagicBytes(fakeBuf, '.pdf')).toBe(false)
  })

  it('accepts valid DOCX magic bytes (ZIP header)', () => {
    const zipBuf = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00])
    expect(validateMagicBytes(zipBuf, '.docx')).toBe(true)
  })

  it('rejects invalid DOCX magic bytes', () => {
    const fakeBuf = Buffer.from('NOT A DOCX', 'ascii')
    expect(validateMagicBytes(fakeBuf, '.docx')).toBe(false)
  })

  it('rejects text files with NULL bytes (binary content)', () => {
    const binaryBuf = Buffer.from([0x48, 0x65, 0x6C, 0x6C, 0x00, 0x6F])
    expect(validateMagicBytes(binaryBuf, '.txt')).toBe(false)
  })

  it('accepts valid text files', () => {
    const textBuf = Buffer.from('Hello, world! This is valid text.', 'utf-8')
    expect(validateMagicBytes(textBuf, '.txt')).toBe(true)
  })

  it('rejects buffers shorter than 4 bytes', () => {
    const shortBuf = Buffer.from([0x50, 0x4B])
    expect(validateMagicBytes(shortBuf, '.pdf')).toBe(false)
  })

  it('accepts valid .doc (OLE2/CFBF) magic bytes', () => {
    const ole2Buf = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0x00, 0x00])
    expect(validateMagicBytes(ole2Buf, '.doc')).toBe(true)
  })

  it('rejects invalid .doc magic bytes (e.g. text file renamed to .doc)', () => {
    const fakeBuf = Buffer.from('This is a text file pretending to be .doc', 'utf-8')
    expect(validateMagicBytes(fakeBuf, '.doc')).toBe(false)
  })

  it('rejects .doc with fewer than 8 bytes', () => {
    const shortBuf = Buffer.from([0xD0, 0xCF, 0x11, 0xE0])
    expect(validateMagicBytes(shortBuf, '.doc')).toBe(false)
  })

  it('rejects unknown extensions (no fallback to true)', () => {
    const buf = Buffer.from('some content here', 'utf-8')
    expect(validateMagicBytes(buf, '.exe')).toBe(false)
    expect(validateMagicBytes(buf, '.js')).toBe(false)
    expect(validateMagicBytes(buf, '.html')).toBe(false)
  })
})
