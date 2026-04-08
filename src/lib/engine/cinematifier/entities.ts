/**
 * entities.ts — Book & ReadingProgress Entity Factories
 *
 * Creates domain entities from raw data. These factories ensure consistent
 * structure and defaults across the application.
 */

import type { Chapter, ChapterSegment } from '../../../types/cinematifier';

export function createBookFromSegments(
    segments: ChapterSegment[],
    title: string = 'Untitled Novel',
    options: {
        author?: string;
        description?: string;
        genre?: import('../../../types/cinematifier').BookGenre;
        isPublic?: boolean;
    } = {},
): import('../../../types/cinematifier').Book {
    const bookId = 'book-' + String(Date.now());
    const epoch = bookId.slice('book-'.length);

    const chapters: Chapter[] = segments.map((seg, index) => ({
        id: `chapter-${epoch}-${index}`,
        bookId,
        number: index + 1,
        title: seg.title,
        originalText: seg.content,
        cinematifiedBlocks: [],
        status: 'pending' as const,
        isProcessed: false,
        wordCount: seg.content.split(/\s+/).filter(Boolean).length,
        estimatedReadTime: Math.ceil(seg.content.split(/\s+/).filter(Boolean).length / 200),
    }));

    return {
        id: bookId,
        title,
        author: options.author,
        description: options.description,
        genre: options.genre || 'other',
        status: 'processing',
        totalChapters: chapters.length,
        processedChapters: 0,
        isPublic: options.isPublic ?? false,
        chapters,
        totalWordCount: chapters.reduce((acc, ch) => acc + ch.wordCount, 0),
        createdAt: Date.now(),
    };
}

export function createReadingProgress(
    bookId: string,
): import('../../../types/cinematifier').ReadingProgress {
    return {
        id: 'progress-' + bookId,
        bookId,
        currentChapter: 1,
        scrollPosition: 0,
        readingMode: 'cinematified',
        bookmarks: [],
        completed: false,
        lastReadAt: Date.now(),
        readChapters: [],
        totalReadTime: 0,
    };
}
