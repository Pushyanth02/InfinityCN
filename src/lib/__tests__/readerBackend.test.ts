import { beforeEach, describe, expect, it } from 'vitest';
import type { Book, CinematicBlock, ReadingProgress } from '../../types/cinematifier';
import {
    clearReaderTelemetry,
    getReaderAnalyticsSummary,
    listReaderTelemetrySnapshots,
    recordReaderTelemetrySnapshot,
} from '../runtime/readerBackend';

function makeBook(bookId = 'book-analytics-1'): Book {
    return {
        id: bookId,
        title: 'Telemetry Novel',
        genre: 'other',
        status: 'ready',
        totalChapters: 3,
        processedChapters: 3,
        isPublic: false,
        chapters: [
            {
                id: 'chapter-1',
                bookId,
                number: 1,
                title: 'Chapter 1',
                originalText: 'One',
                cinematifiedBlocks: [],
                status: 'ready',
                wordCount: 1000,
                isProcessed: true,
                estimatedReadTime: 5,
            },
            {
                id: 'chapter-2',
                bookId,
                number: 2,
                title: 'Chapter 2',
                originalText: 'Two',
                cinematifiedBlocks: [],
                status: 'ready',
                wordCount: 1000,
                isProcessed: true,
                estimatedReadTime: 5,
            },
            {
                id: 'chapter-3',
                bookId,
                number: 3,
                title: 'Chapter 3',
                originalText: 'Three',
                cinematifiedBlocks: [],
                status: 'ready',
                wordCount: 1000,
                isProcessed: true,
                estimatedReadTime: 5,
            },
        ],
        totalWordCount: 3000,
        createdAt: Date.now(),
    };
}

function makeProgress(bookId = 'book-analytics-1'): ReadingProgress {
    return {
        id: 'progress-1',
        bookId,
        currentChapter: 2,
        scrollPosition: 0,
        readingMode: 'cinematified',
        bookmarks: [],
        completed: false,
        lastReadAt: Date.now(),
        readChapters: [1],
        totalReadTime: 600,
    };
}

let blockCounter = 0;

function makeBlock(overrides: Partial<CinematicBlock>): CinematicBlock {
    return {
        id: overrides.id ?? `block-${++blockCounter}`,
        type: 'action',
        content: 'Sample block',
        intensity: 'normal',
        ...overrides,
    };
}

describe('readerBackend analytics', () => {
    beforeEach(() => {
        blockCounter = 0;
        clearReaderTelemetry();
    });

    it('estimates progress and pace from reading progress plus telemetry snapshots', () => {
        const book = makeBook();
        const progress = makeProgress();

        recordReaderTelemetrySnapshot({
            bookId: book.id,
            chapterNumber: 2,
            readerMode: 'cinematified',
            scrollRatio: 0.5,
            totalReadTimeSec: progress.totalReadTime,
            timestamp: Date.now(),
        });

        const summary = getReaderAnalyticsSummary(book, progress);

        expect(summary).not.toBeNull();
        expect(summary?.wordsReadEstimate).toBe(1500);
        expect(summary?.completionPercent).toBe(50);
        expect(summary?.averageWordsPerMinute).toBe(150);
        expect(summary?.estimatedMinutesRemaining).toBe(10);
        expect((summary?.todayReadingMinutes ?? 0) > 0).toBe(true);
        expect(summary?.cinematicDepthScore).toBe(0);
        expect(summary?.cinematicRhythm).toBe('Measured');
    });

    it('counts separated sessions when telemetry samples have long idle gaps', () => {
        const book = makeBook();
        const progress = makeProgress();
        const now = Date.now();

        recordReaderTelemetrySnapshot({
            bookId: book.id,
            chapterNumber: 2,
            readerMode: 'original',
            scrollRatio: 0.2,
            totalReadTimeSec: 300,
            timestamp: now - 2 * 60 * 60 * 1000,
        });

        recordReaderTelemetrySnapshot({
            bookId: book.id,
            chapterNumber: 2,
            readerMode: 'original',
            scrollRatio: 0.35,
            totalReadTimeSec: 600,
            timestamp: now,
        });

        const summary = getReaderAnalyticsSummary(book, progress);

        expect(summary).not.toBeNull();
        expect((summary?.sessionCount ?? 0) >= 2).toBe(true);
    });

    it('sanitizes telemetry values and deduplicates near-identical samples', () => {
        const book = makeBook();
        const now = Date.now();

        recordReaderTelemetrySnapshot({
            bookId: book.id,
            chapterNumber: 2,
            readerMode: 'cinematified',
            scrollRatio: 1.6,
            totalReadTimeSec: -14,
            timestamp: now,
        });

        recordReaderTelemetrySnapshot({
            bookId: book.id,
            chapterNumber: 2,
            readerMode: 'cinematified',
            scrollRatio: 1.61,
            totalReadTimeSec: 18,
            timestamp: now + 10_000,
        });

        const snapshots = listReaderTelemetrySnapshots(book.id);
        expect(snapshots).toHaveLength(1);
        expect(snapshots[0]?.scrollRatio).toBe(1);
        expect(snapshots[0]?.totalReadTimeSec).toBe(0);
    });

    it('clears telemetry for one book without affecting others', () => {
        const firstBook = makeBook('book-analytics-1');
        const secondBook = makeBook('book-analytics-2');
        const now = Date.now();

        recordReaderTelemetrySnapshot({
            bookId: firstBook.id,
            chapterNumber: 1,
            readerMode: 'original',
            scrollRatio: 0.25,
            totalReadTimeSec: 120,
            timestamp: now,
        });

        recordReaderTelemetrySnapshot({
            bookId: secondBook.id,
            chapterNumber: 1,
            readerMode: 'cinematified',
            scrollRatio: 0.6,
            totalReadTimeSec: 220,
            timestamp: now,
        });

        clearReaderTelemetry(firstBook.id);

        expect(listReaderTelemetrySnapshots(firstBook.id)).toHaveLength(0);
        expect(listReaderTelemetrySnapshots(secondBook.id)).toHaveLength(1);
    });

    it('computes cinematic metrics from chapter blocks with mixed metadata', () => {
        const book = makeBook();
        const progress = makeProgress();

        book.chapters[1].cinematifiedBlocks = [
            makeBlock({ id: 'b1', type: 'dialogue', emotion: 'fear', timing: 'rapid', tensionScore: 80 }),
            makeBlock({
                id: 'b2',
                type: 'action',
                emotion: 'suspense',
                tensionScore: 20,
                transition: { type: 'CUT TO' },
            }),
            makeBlock({
                id: 'b3',
                type: 'sfx',
                emotion: 'fear',
                tensionScore: 60,
                sfx: { sound: 'BOOM', intensity: 'loud' },
            }),
            makeBlock({ id: 'b4', type: 'inner_thought', emotion: 'fear', timing: 'rapid', tensionScore: 50 }),
            makeBlock({
                id: 'b5',
                type: 'transition',
                emotion: 'fear',
                timing: 'rapid',
                tensionScore: 70,
                transition: { type: 'FADE OUT' },
            }),
        ];
        book.chapters[1].cinematizedScenes = [
            { title: 'Scene A', paragraphs: ['A'] },
            { title: 'Scene B', paragraphs: ['B'] },
        ];

        recordReaderTelemetrySnapshot({
            bookId: book.id,
            chapterNumber: 2,
            readerMode: 'cinematified',
            scrollRatio: 0.4,
            totalReadTimeSec: progress.totalReadTime,
            timestamp: Date.now(),
        });

        const summary = getReaderAnalyticsSummary(book, progress);

        expect(summary).not.toBeNull();
        expect(summary?.cinematicSceneCount).toBe(2);
        expect(summary?.cinematicCueCount).toBe(5);
        expect(summary?.cinematicAverageTension).toBe(56);
        expect(summary?.cinematicTensionSwing).toBe(60);
        expect(summary?.cinematicDominantEmotion).toBe('fear');
        expect(summary?.cinematicEmotionRange).toBe(2);
        expect(summary?.cinematicTransitionCount).toBe(2);
        expect(summary?.cinematicSfxCount).toBe(1);
        expect(summary?.cinematicDialogueRatio).toBe(40);
        expect(summary?.cinematicRhythm).toBe('Frenetic');
    });

    it('falls back to cue-density rhythm scoring when no block timing is present', () => {
        const book = makeBook();
        const progress = makeProgress();

        book.chapters[1].cinematifiedBlocks = [
            makeBlock({ id: 'f1', type: 'action' }),
            makeBlock({ id: 'f2', type: 'dialogue' }),
            makeBlock({ id: 'f3', type: 'sfx', sfx: { sound: 'THUD', intensity: 'medium' } }),
            makeBlock({ id: 'f4', type: 'beat' }),
            makeBlock({ id: 'f5', type: 'inner_thought' }),
        ];
        book.chapters[1].cinematizedScenes = [{ title: 'Single Scene', paragraphs: ['A', 'B'] }];

        const summary = getReaderAnalyticsSummary(book, progress);

        expect(summary).not.toBeNull();
        expect(summary?.cinematicSceneCount).toBe(1);
        expect(summary?.cinematicCueCount).toBe(5);
        expect(summary?.cinematicRhythm).toBe('Frenetic');
    });
});
