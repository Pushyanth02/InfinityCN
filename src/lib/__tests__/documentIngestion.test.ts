/**
 * documentIngestion.test.ts — Tests for the Document Ingestion Pipeline
 *
 * Covers:
 *   • IngestionError classification
 *   • validateForIngestion — pre-flight validation
 *   • ingestDocument — full pipeline (mocked extraction)
 *   • Edge cases: empty files, corrupted, aborted
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    IngestionError,
    validateForIngestion,
    ingestDocument,
    getSupportedFormats,
} from '../processing/documentIngestion';
import type { IngestionProgress } from '../processing/documentIngestion';

// ─── Mock pdfWorker ────────────────────────────────────────────────────────────

const sampleExtractedText = [
    'Chapter 1: The Beginning',
    '',
    'The sun rose over the mountains. Birds sang in the trees.',
    'He walked slowly through the meadow, breathing deep.',
    '',
    '"Where are you going?" she asked.',
    '',
    '"Home," he replied. "Always home."',
    '',
    'Hours later, they arrived at the old cabin.',
    'The fire was already lit. Warmth spread through the room.',
    '',
    'Chapter 2: The Journey',
    '',
    'The road stretched endlessly ahead. Dust swirled around them.',
    'Meanwhile, in the town below, the bells began to ring.',
    'Everyone knew what that meant.',
    '',
    '"We need to move," Mara said firmly.',
    'Jon nodded. They gathered their things.',
].join('\n');

vi.mock('../processing/pdfWorker', () => ({
    extractText: vi.fn(async (_file: File, onProgress?: (p: unknown) => void) => {
        onProgress?.({
            format: 'txt',
            stage: 'extracting',
            percentComplete: 50,
            message: 'Reading text file...',
        });
        onProgress?.({
            format: 'txt',
            stage: 'complete',
            percentComplete: 100,
            message: 'Done.',
        });
        return sampleExtractedText;
    }),
    detectFormat: vi.fn((file: File) => {
        const name = file.name.toLowerCase();
        if (name.endsWith('.txt')) return 'txt';
        if (name.endsWith('.pdf')) return 'pdf';
        if (name.endsWith('.docx')) return 'docx';
        if (name.endsWith('.epub')) return 'epub';
        if (name.endsWith('.doc')) throw new Error('Legacy .doc format is not supported.');
        throw new Error('Unsupported file format.');
    }),
    ACCEPTED_EXTENSIONS: '.pdf,.epub,.docx,.pptx,.txt',
}));

function createMockFile(name: string, content = 'test', size?: number): File {
    const file = new File([content], name, { type: 'text/plain' });
    if (size !== undefined) {
        Object.defineProperty(file, 'size', { value: size });
    }
    return file;
}

beforeEach(() => {
    vi.clearAllMocks();
});

// ─── IngestionError ────────────────────────────────────────────────────────────

describe('IngestionError', () => {
    it('creates structured error with code and stage', () => {
        const err = new IngestionError({
            code: 'FILE_EMPTY',
            stage: 'validating',
            message: 'No content.',
            userMessage: 'The file is empty.',
        });

        expect(err.code).toBe('FILE_EMPTY');
        expect(err.stage).toBe('validating');
        expect(err.userMessage).toBe('The file is empty.');
        expect(err.recoverable).toBe(false);
        expect(err.name).toBe('IngestionError');
        expect(err).toBeInstanceOf(Error);
    });

    it('supports recoverable flag', () => {
        const err = new IngestionError({
            code: 'OCR_FAILED',
            stage: 'extracting',
            message: 'OCR crashed.',
            userMessage: 'OCR failed.',
            recoverable: true,
        });

        expect(err.recoverable).toBe(true);
    });

    it('supports error cause', () => {
        const cause = new Error('root');
        const err = new IngestionError({
            code: 'CORRUPTED_FILE',
            stage: 'extracting',
            message: 'Bad file.',
            userMessage: 'Corrupted.',
            cause,
        });

        expect(err.cause).toBe(cause);
    });
});

// ─── validateForIngestion ──────────────────────────────────────────────────────

describe('validateForIngestion', () => {
    it('returns null for valid TXT file', () => {
        const file = createMockFile('test.txt', 'content');
        expect(validateForIngestion(file)).toBeNull();
    });

    it('returns null for valid PDF file', () => {
        const file = createMockFile('book.pdf', 'data');
        expect(validateForIngestion(file)).toBeNull();
    });

    it('returns error for empty file', () => {
        const file = createMockFile('empty.txt', '', 0);
        const result = validateForIngestion(file);
        expect(result).not.toBeNull();
        expect(result).toContain('empty');
    });

    it('returns error for file too large', () => {
        const file = createMockFile('huge.txt', 'x', 60 * 1024 * 1024);
        const result = validateForIngestion(file);
        expect(result).not.toBeNull();
        expect(result).toContain('50 MB');
    });

    it('returns error for legacy .doc format', () => {
        const file = createMockFile('old.doc', 'data');
        const result = validateForIngestion(file);
        expect(result).not.toBeNull();
        expect(result!.toLowerCase()).toContain('legacy');
    });

    it('returns error for unsupported format', () => {
        const file = createMockFile('image.png', 'data');
        const result = validateForIngestion(file);
        expect(result).not.toBeNull();
    });
});

// ─── getSupportedFormats ───────────────────────────────────────────────────────

describe('getSupportedFormats', () => {
    it('returns supported format info', () => {
        const formats = getSupportedFormats();
        expect(formats.length).toBeGreaterThan(0);
        expect(formats.some(f => f.extension === '.pdf')).toBe(true);
        expect(formats.some(f => f.extension === '.docx')).toBe(true);
        expect(formats.some(f => f.extension === '.txt')).toBe(true);
        expect(formats.every(f => f.label && f.mime)).toBe(true);
    });
});

// ─── ingestDocument ────────────────────────────────────────────────────────────

describe('ingestDocument', () => {
    it('processes a valid TXT file end-to-end', async () => {
        const file = createMockFile('novel.txt', sampleExtractedText);
        const result = await ingestDocument(file);

        expect(result.format).toBe('txt');
        expect(result.title).toBeDefined();
        expect(result.totalWords).toBeGreaterThan(0);
        expect(result.chapters.length).toBeGreaterThanOrEqual(1);
        expect(result.cleanedText).toBeTruthy();
        expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
        expect(result.warnings).toBeInstanceOf(Array);
    });

    it('each chapter has structured narrative data', async () => {
        const file = createMockFile('novel.txt', sampleExtractedText);
        const result = await ingestDocument(file);

        for (const chapter of result.chapters) {
            expect(chapter.title).toBeTruthy();
            expect(chapter.content).toBeTruthy();
            expect(chapter.narrative).toBeDefined();
            expect(chapter.narrative.paragraphs.length).toBeGreaterThan(0);
            expect(chapter.narrative.scenes.length).toBeGreaterThan(0);
            expect(chapter.narrative.stats).toBeDefined();
        }
    });

    it('generates full-document narrative', async () => {
        const file = createMockFile('novel.txt', sampleExtractedText);
        const result = await ingestDocument(file);

        expect(result.fullNarrative).toBeDefined();
        expect(result.fullNarrative.stats.totalWords).toBeGreaterThan(0);
        expect(result.fullNarrative.paragraphs.length).toBeGreaterThan(0);
    });

    it('reports progress through stages', async () => {
        const stages: string[] = [];
        const file = createMockFile('novel.txt', sampleExtractedText);

        await ingestDocument(file, {
            onProgress: (progress: IngestionProgress) => {
                stages.push(progress.stage);
                expect(progress.percentComplete).toBeGreaterThanOrEqual(0);
                expect(progress.percentComplete).toBeLessThanOrEqual(100);
                expect(progress.message).toBeTruthy();
            },
        });

        expect(stages).toContain('validating');
        expect(stages).toContain('extracting');
        expect(stages).toContain('cleaning');
        expect(stages).toContain('normalizing');
        expect(stages).toContain('detecting_chapters');
        expect(stages).toContain('processing_text');
        expect(stages).toContain('complete');
    });

    it('supports abort signal', async () => {
        const controller = new AbortController();
        controller.abort(); // immediately abort

        const file = createMockFile('novel.txt', sampleExtractedText);

        await expect(
            ingestDocument(file, { signal: controller.signal }),
        ).rejects.toThrow(IngestionError);

        try {
            await ingestDocument(file, { signal: controller.signal });
        } catch (err) {
            expect(err).toBeInstanceOf(IngestionError);
            expect((err as IngestionError).code).toBe('PIPELINE_ABORTED');
        }
    });

    it('rejects empty file', async () => {
        const file = createMockFile('empty.txt', '', 0);

        await expect(ingestDocument(file)).rejects.toThrow(IngestionError);

        try {
            await ingestDocument(file);
        } catch (err) {
            expect((err as IngestionError).code).toBe('FILE_EMPTY');
        }
    });

    it('rejects unsupported format', async () => {
        const file = createMockFile('image.png', 'data');

        await expect(ingestDocument(file)).rejects.toThrow(IngestionError);
    });

    it('title falls back to filename when not detected', async () => {
        const file = createMockFile('My Novel.txt', sampleExtractedText);
        const result = await ingestDocument(file);

        // Either detected or filename-based
        expect(result.title).toBeTruthy();
        expect(result.title).not.toBe('');
    });

    it('includes format in progress updates', async () => {
        const file = createMockFile('novel.txt', sampleExtractedText);
        const formats: Set<string> = new Set();

        await ingestDocument(file, {
            onProgress: (p) => {
                if (p.format) formats.add(p.format);
            },
        });

        expect(formats.has('txt')).toBe(true);
    });
});
