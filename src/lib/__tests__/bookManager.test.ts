import { beforeEach, describe, expect, it } from 'vitest';
import { BookManager } from '../runtime/bookManager';
import type { Book, Chapter } from '../../types/cinematifier';

function makeChapter(bookId: string, number: number, title: string): Chapter {
    return {
        id: `${bookId}-chapter-${number}`,
        bookId,
        number,
        title,
        originalText: `${title} content`,
        cinematifiedBlocks: [],
        status: 'pending',
        wordCount: 120,
        isProcessed: false,
        estimatedReadTime: 1,
    };
}

function makeBook(id: string, title: string, chapterCount = 2): Book {
    const chapters: Chapter[] = Array.from({ length: chapterCount }, (_, index) =>
        makeChapter(id, index + 1, `Chapter ${index + 1}`),
    );

    return {
        id,
        title,
        genre: 'other',
        status: 'ready',
        totalChapters: chapters.length,
        processedChapters: chapters.length,
        isPublic: false,
        chapters,
        totalWordCount: chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
        createdAt: Date.now(),
    };
}

describe('BookManager', () => {
    let manager: BookManager;

    beforeEach(() => {
        manager = new BookManager({ storageKey: 'test:book-manager' });
        manager.clear();
    });

    it('stores books and lists them', () => {
        manager.storeBook(makeBook('book-1', 'First Book'));
        manager.storeBook(makeBook('book-2', 'Second Book'));

        const books = manager.listBooks();
        expect(books.length).toBe(2);
        expect(books.map(book => book.id).sort()).toEqual(['book-1', 'book-2']);
    });

    it('retrieves a book by id', () => {
        const stored = manager.storeBook(makeBook('book-42', 'Forty Two'));
        const found = manager.getBookById('book-42');

        expect(found).not.toBeNull();
        expect(found?.id).toBe(stored.id);
        expect(found?.title).toBe('Forty Two');
    });

    it('groups chapters by book id', () => {
        manager.storeBook(makeBook('book-a', 'Book A', 3));
        manager.storeBook(makeBook('book-b', 'Book B', 1));

        const grouped = manager.groupChapters();

        expect(Object.keys(grouped).sort()).toEqual(['book-a', 'book-b']);
        expect(grouped['book-a']).toHaveLength(3);
        expect(grouped['book-b']).toHaveLength(1);
    });

    it('deletes a book by id', () => {
        manager.storeBook(makeBook('book-delete', 'Delete Me'));

        const deleted = manager.deleteBook('book-delete');

        expect(deleted).toBe(true);
        expect(manager.getBookById('book-delete')).toBeNull();
        expect(manager.listBooks()).toHaveLength(0);
    });
});
