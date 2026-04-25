/**
 * exportPipeline.test.ts — Tests for the Book Export Pipeline
 *
 * Covers:
 *   • Content serialization (original + cinematized modes)
 *   • Plain text export
 *   • PDF layout engine (page breaks, chapter headers, title page)
 *   • Progress reporting
 *   • Abort/cancel support
 *   • Edge cases (empty chapters, long content)
 */

import { describe, it, expect, vi } from 'vitest';
import { exportBook, exportChapter, downloadExport } from '../export/exportPipeline';
import type { ExportProgress, ExportResult } from '../export/exportPipeline';
import type { Book, Chapter, CinematicBlock } from '../../types/cinematifier';

// ─── Test Data Builders ────────────────────────────────────────────────────────

function createBlock(overrides?: Partial<CinematicBlock>): CinematicBlock {
    return {
        id: `block-${Math.random().toString(36).slice(2, 8)}`,
        type: 'action',
        content: 'The wind howled through the canyon.',
        intensity: 'normal',
        timing: 'normal',
        ...overrides,
    };
}

function createChapter(overrides?: Partial<Chapter>): Chapter {
    return {
        id: `ch-${Math.random().toString(36).slice(2, 8)}`,
        bookId: 'book-1',
        number: 1,
        title: 'Chapter 1: The Beginning',
        originalText: 'The morning sun cast long shadows across the valley.\n\nBirds sang in the ancient oaks, their melodies echoing through the mist.',
        originalModeText: 'The morning sun cast long shadows across the valley.\n\nBirds sang in the ancient oaks, their melodies echoing through the mist.',
        cinematifiedText: 'The morning sun...',
        cinematifiedBlocks: [
            createBlock({ type: 'action', content: 'The morning sun cast long shadows across the valley.' }),
            createBlock({ type: 'dialogue', content: '"Look at that sunrise," she whispered.', speaker: 'Elena' }),
            createBlock({ type: 'action', content: 'He stepped forward, shielding his eyes.' }),
            createBlock({ type: 'beat', content: 'A long silence.' }),
        ],
        status: 'ready',
        wordCount: 30,
        isProcessed: true,
        estimatedReadTime: 1,
        ...overrides,
    };
}

function createBook(overrides?: Partial<Book>): Book {
    return {
        id: 'book-1',
        title: 'The Test Novel',
        author: 'Test Author',
        description: 'A novel for testing the export pipeline.',
        genre: 'fantasy',
        status: 'ready',
        totalChapters: 3,
        processedChapters: 3,
        isPublic: false,
        chapters: [
            createChapter({ number: 1, title: 'Chapter 1: Dawn' }),
            createChapter({ number: 2, title: 'Chapter 2: Journey' }),
            createChapter({ number: 3, title: 'Chapter 3: Arrival' }),
        ],
        totalWordCount: 90,
        createdAt: Date.now(),
        ...overrides,
    };
}

// ─── sanitizeFilename (exported for testing) ───────────────────────────────────

// We test the internal via the result filename

// ─── Text Export ───────────────────────────────────────────────────────────────

describe('Text Export', () => {
    it('exports original mode as plain text', async () => {
        const book = createBook();
        const result = await exportBook(book, { mode: 'original', format: 'txt' });

        expect(result.format).toBe('txt');
        expect(result.mode).toBe('original');
        expect(result.blob.type).toContain('text/plain');
        expect(result.filename).toMatch(/\.txt$/);
        expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);

        const text = await result.blob.text();
        expect(text).toContain('THE TEST NOVEL');
        expect(text).toContain('Test Author');
        expect(text).toContain('Chapter 1: Dawn');
        expect(text).toContain('morning sun');
    });

    it('exports cinematized mode as plain text', async () => {
        const book = createBook();
        const result = await exportBook(book, { mode: 'cinematized', format: 'txt' });

        const text = await result.blob.text();
        expect(text).toContain('[Elena]');
        expect(text).toContain('[BEAT]');
        expect(text).toContain('morning sun');
    });

    it('exports specific chapters only', async () => {
        const book = createBook();
        const result = await exportBook(book, {
            mode: 'original', format: 'txt',
            chapterIndices: [1], // Only chapter 2
        });

        const text = await result.blob.text();
        expect(text).toContain('Chapter 2: Journey');
        expect(text).not.toContain('Chapter 1: Dawn');
        expect(text).not.toContain('Chapter 3: Arrival');
    });

    it('excludes title page when disabled', async () => {
        const book = createBook();
        const result = await exportBook(book, {
            mode: 'original', format: 'txt',
            includeTitlePage: false,
        });

        const text = await result.blob.text();
        expect(text).not.toContain('THE TEST NOVEL');
    });

    it('excludes chapter headers when disabled', async () => {
        const book = createBook();
        const result = await exportBook(book, {
            mode: 'original', format: 'txt',
            includeChapterHeaders: false,
        });

        const text = await result.blob.text();
        expect(text).not.toContain('─── Chapter 1');
    });

    it('generates correct filename', async () => {
        const book = createBook({ title: 'My Great Novel!' });
        const result = await exportBook(book, { mode: 'original', format: 'txt' });

        expect(result.filename).toBe('My_Great_Novel_original.txt');
    });
});

// ─── PDF Export ────────────────────────────────────────────────────────────────

// NOTE: PDF generation requires jspdf. These tests mock it.
vi.mock('jspdf', () => {
    class MockJsPDF {
        private pages: number = 1;
        addPage() { this.pages++; }
        setFont() {}
        setFontSize() {}
        setTextColor() {}
        text() {}
        output(type: string) {
            if (type === 'blob') {
                return new Blob(['%PDF-mock'], { type: 'application/pdf' });
            }
            return '';
        }
    }
    return { jsPDF: MockJsPDF };
});

describe('PDF Export', () => {
    it('exports original mode as PDF', async () => {
        const book = createBook();
        const result = await exportBook(book, { mode: 'original', format: 'pdf' });

        expect(result.format).toBe('pdf');
        expect(result.mode).toBe('original');
        expect(result.blob.type).toContain('application/pdf');
        expect(result.filename).toMatch(/\.pdf$/);
        expect(result.totalPages).toBeGreaterThan(0);
    });

    it('exports cinematized mode as PDF', async () => {
        const book = createBook();
        const result = await exportBook(book, { mode: 'cinematized', format: 'pdf' });

        expect(result.format).toBe('pdf');
        expect(result.mode).toBe('cinematized');
        expect(result.totalPages).toBeGreaterThan(0);
    });

    it('creates title page when enabled', async () => {
        const book = createBook();
        const result = await exportBook(book, {
            mode: 'original', format: 'pdf',
            includeTitlePage: true,
        });

        // Title page + at least 1 chapter page
        expect(result.totalPages).toBeGreaterThanOrEqual(2);
    });

    it('handles long chapters with pagination', async () => {
        // Create a chapter with lots of content
        const longText = Array(200).fill('This is a paragraph with enough words to test pagination across multiple pages in the export pipeline.').join('\n\n');
        const book = createBook({
            chapters: [createChapter({ originalText: longText, originalModeText: longText })],
            totalChapters: 1,
        });

        const result = await exportBook(book, { mode: 'original', format: 'pdf' });
        expect(result.totalPages).toBeGreaterThan(3);
    });

    it('exports single chapter', async () => {
        const book = createBook();
        const result = await exportChapter(book, 1, { mode: 'original', format: 'pdf' });

        expect(result.totalPages).toBeGreaterThanOrEqual(1);
    });
});

// ─── Progress Reporting ────────────────────────────────────────────────────────

describe('Progress Reporting', () => {
    it('reports progress through all phases (txt)', async () => {
        const phases: string[] = [];
        const book = createBook();

        await exportBook(book, {
            mode: 'original', format: 'txt',
            onProgress: (p: ExportProgress) => {
                phases.push(p.phase);
                expect(p.percentComplete).toBeGreaterThanOrEqual(0);
                expect(p.percentComplete).toBeLessThanOrEqual(100);
            },
        });

        expect(phases).toContain('preparing');
        expect(phases).toContain('serializing');
        expect(phases).toContain('complete');
    });

    it('reports progress through all phases (pdf)', async () => {
        const phases: string[] = [];
        const book = createBook();

        await exportBook(book, {
            mode: 'original', format: 'pdf',
            onProgress: (p) => phases.push(p.phase),
        });

        expect(phases).toContain('preparing');
        expect(phases).toContain('serializing');
        expect(phases).toContain('rendering');
        expect(phases).toContain('assembling');
        expect(phases).toContain('complete');
    });
});

// ─── Abort Support ─────────────────────────────────────────────────────────────

describe('Abort Support', () => {
    it('cancels export when signal is aborted', async () => {
        const controller = new AbortController();
        controller.abort();

        const book = createBook();
        await expect(
            exportBook(book, { mode: 'original', format: 'pdf', signal: controller.signal }),
        ).rejects.toThrow('cancelled');
    });
});

// ─── Edge Cases ────────────────────────────────────────────────────────────────

describe('Edge Cases', () => {
    it('throws on empty chapters', async () => {
        const book = createBook({ chapters: [] });
        await expect(
            exportBook(book, { mode: 'original', format: 'txt' }),
        ).rejects.toThrow('No chapters');
    });

    it('handles chapter with no cinematified blocks', async () => {
        const book = createBook({
            chapters: [createChapter({ cinematifiedBlocks: [] })],
            totalChapters: 1,
        });

        const result = await exportBook(book, { mode: 'cinematized', format: 'txt' });
        const text = await result.blob.text();
        expect(text).toBeTruthy();
    });

    it('handles chapter with no originalModeText (falls back to originalText)', async () => {
        const book = createBook({
            chapters: [createChapter({ originalModeText: undefined })],
            totalChapters: 1,
        });

        const result = await exportBook(book, { mode: 'original', format: 'txt' });
        const text = await result.blob.text();
        expect(text).toContain('morning sun');
    });

    it('handles book with no author', async () => {
        const book = createBook({ author: undefined });
        const result = await exportBook(book, { mode: 'original', format: 'txt' });
        const text = await result.blob.text();
        expect(text).not.toContain('by undefined');
    });

    it('handles special characters in title', async () => {
        const book = createBook({ title: 'Héllo "World" <Test> & More!' });
        const result = await exportBook(book, { mode: 'original', format: 'txt' });
        expect(result.filename).toMatch(/\.txt$/);
        expect(result.filename).not.toMatch(/[<>"]/);
    });
});

// ─── Download ──────────────────────────────────────────────────────────────────

describe('downloadExport', () => {
    it('triggers download via anchor element', () => {
        const createObjectURL = vi.fn(() => 'blob:test');
        const revokeObjectURL = vi.fn();
        const appendChild = vi.fn();
        const removeChild = vi.fn();
        const click = vi.fn();

        const mockAnchor = { href: '', download: '', style: { display: '' }, click };
        vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLAnchorElement);
        vi.spyOn(document.body, 'appendChild').mockImplementation(appendChild);
        vi.spyOn(document.body, 'removeChild').mockImplementation(removeChild);
        vi.spyOn(URL, 'createObjectURL').mockImplementation(createObjectURL);
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectURL);

        const result: ExportResult = {
            blob: new Blob(['test']),
            filename: 'test.pdf',
            format: 'pdf',
            mode: 'original',
            totalPages: 1,
            processingTimeMs: 100,
        };

        downloadExport(result);

        expect(click).toHaveBeenCalled();
        expect(mockAnchor.download).toBe('test.pdf');
        expect(createObjectURL).toHaveBeenCalled();

        vi.restoreAllMocks();
    });
});
