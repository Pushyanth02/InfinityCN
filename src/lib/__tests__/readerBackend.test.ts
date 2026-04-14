import { beforeEach, describe, expect, it } from 'vitest';
import type { Book, ReadingProgress } from '../../types/cinematifier';
import {
    clearReaderTelemetry,
    getReaderAnalyticsSummary,
    recordReaderTelemetrySnapshot,
} from '../runtime/readerBackend';

function makeBook(): Book {
    return {
        id: 'book-analytics-1',
        title: 'Telemetry Novel',
        genre: 'other',
        status: 'ready',
        totalChapters: 3,
        processedChapters: 3,
        isPublic: false,
        chapters: [
            {
                id: 'chapter-1',
                bookId: 'book-analytics-1',
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
                bookId: 'book-analytics-1',
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
                bookId: 'book-analytics-1',
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

function makeProgress(): ReadingProgress {
    return {
        id: 'progress-1',
        bookId: 'book-analytics-1',
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

describe('readerBackend analytics', () => {
    beforeEach(() => {
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
});
