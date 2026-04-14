/**
 * pdfWorker.test.ts — Unit tests for pdfWorker.ts
 *
 * Covers:
 *   • detectFormat    — format detection from file extension / MIME type
 *   • ACCEPTED_EXTENSIONS — constant value validation
 *
 * Note: extractText and its sub-functions (PDF, EPUB, DOCX, PPTX extraction) are
 * not unit-tested here because they require heavy external libs (pdfjs-dist, fflate,
 * tesseract.js) that are dynamically imported — those paths are covered in integration
 * / E2E tests.
 */

import { describe, it, expect } from 'vitest';
import { detectFormat, ACCEPTED_EXTENSIONS, extractPDFText } from '../pdfWorker';

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** Create a minimal File-like object without reading its content */
function makeFile(name: string, size = 1024, type = ''): File {
    const blob = new Blob(['x'.repeat(Math.min(size, 10))], { type });
    return new File([blob], name, { type });
}

// Maximum file size is 50 MB (50 * 1024 * 1024)
const MAX_SIZE = 50 * 1024 * 1024;

// ─── ACCEPTED_EXTENSIONS ─────────────────────────────────────────────────────

describe('ACCEPTED_EXTENSIONS', () => {
    it('is a comma-separated string', () => {
        expect(typeof ACCEPTED_EXTENSIONS).toBe('string');
        expect(ACCEPTED_EXTENSIONS).toContain(',');
    });

    it('includes .pdf', () => {
        expect(ACCEPTED_EXTENSIONS).toContain('.pdf');
    });

    it('includes .epub', () => {
        expect(ACCEPTED_EXTENSIONS).toContain('.epub');
    });

    it('includes .docx', () => {
        expect(ACCEPTED_EXTENSIONS).toContain('.docx');
    });

    it('includes .pptx', () => {
        expect(ACCEPTED_EXTENSIONS).toContain('.pptx');
    });

    it('includes .txt', () => {
        expect(ACCEPTED_EXTENSIONS).toContain('.txt');
    });
});

// ─── detectFormat — extension-based detection ─────────────────────────────────

describe('detectFormat — extension detection', () => {
    it('detects .pdf', () => {
        expect(detectFormat(makeFile('book.pdf'))).toBe('pdf');
    });

    it('detects .epub', () => {
        expect(detectFormat(makeFile('book.epub'))).toBe('epub');
    });

    it('detects .docx', () => {
        expect(detectFormat(makeFile('report.docx'))).toBe('docx');
    });

    it('detects .pptx', () => {
        expect(detectFormat(makeFile('slides.pptx'))).toBe('pptx');
    });

    it('detects .txt', () => {
        expect(detectFormat(makeFile('story.txt'))).toBe('txt');
    });

    it('is case-insensitive (.PDF)', () => {
        expect(detectFormat(makeFile('BOOK.PDF'))).toBe('pdf');
    });

    it('is case-insensitive (.DOCX)', () => {
        expect(detectFormat(makeFile('REPORT.DOCX'))).toBe('docx');
    });
});

// ─── detectFormat — MIME-type fallback ────────────────────────────────────────

describe('detectFormat — MIME type fallback', () => {
    it('detects PDF by MIME type when extension is missing', () => {
        const file = makeFile('document', 1024, 'application/pdf');
        expect(detectFormat(file)).toBe('pdf');
    });

    it('detects plain text by MIME type', () => {
        const file = makeFile('document', 1024, 'text/plain');
        expect(detectFormat(file)).toBe('txt');
    });

    it('detects EPUB by MIME type', () => {
        const file = makeFile('book', 1024, 'application/epub+zip');
        expect(detectFormat(file)).toBe('epub');
    });

    it('detects DOCX by MIME type', () => {
        const file = makeFile(
            'doc',
            1024,
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        );
        expect(detectFormat(file)).toBe('docx');
    });

    it('detects PPTX by MIME type', () => {
        const file = makeFile(
            'slides',
            1024,
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        );
        expect(detectFormat(file)).toBe('pptx');
    });
});

// ─── detectFormat — error cases ───────────────────────────────────────────────

describe('detectFormat — error cases', () => {
    it('throws for files exceeding 50 MB', () => {
        const oversized = makeFile('huge.pdf', MAX_SIZE + 1);
        // Override size property since File size is read-only
        Object.defineProperty(oversized, 'size', { value: MAX_SIZE + 1 });
        expect(() => detectFormat(oversized)).toThrow(/too large/i);
    });

    it('throws for legacy .doc format', () => {
        expect(() => detectFormat(makeFile('old.doc'))).toThrow(/legacy/i);
    });

    it('throws for legacy .ppt format', () => {
        expect(() => detectFormat(makeFile('old.ppt'))).toThrow(/legacy/i);
    });

    it('throws for unsupported extension', () => {
        expect(() => detectFormat(makeFile('image.jpg'))).toThrow(/unsupported/i);
    });

    it('throws for .xls format', () => {
        expect(() => detectFormat(makeFile('data.xls'))).toThrow(/legacy/i);
    });

    it('error message for large file includes the size in MB', () => {
        const oversized = makeFile('huge.pdf');
        Object.defineProperty(oversized, 'size', { value: MAX_SIZE + 1024 * 1024 });
        try {
            detectFormat(oversized);
            expect.fail('should have thrown');
        } catch (err) {
            expect((err as Error).message).toMatch(/MB/);
        }
    });

    it('error for .doc suggests saving as .docx', () => {
        try {
            detectFormat(makeFile('old.doc'));
            expect.fail('should have thrown');
        } catch (err) {
            expect((err as Error).message).toMatch(/docx/i);
        }
    });
});

// ─── extractPDFText API contract ───────────────────────────────────────────

describe('extractPDFText', () => {
    it('rejects non-PDF input files', async () => {
        await expect(extractPDFText(makeFile('notes.txt', 1024, 'text/plain'))).rejects.toThrow(
            /only supports PDF files/i,
        );
    });

    it('rejects unsupported extension before extraction', async () => {
        await expect(extractPDFText(makeFile('image.jpg', 1024, 'image/jpeg'))).rejects.toThrow(
            /unsupported/i,
        );
    });
});
