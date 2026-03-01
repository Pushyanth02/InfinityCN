/**
 * cinematifierDb.ts — IndexedDB persistence for Cinematifier books
 *
 * Stores full book data (chapters, cinematified blocks) in IndexedDB
 * for offline reading and page refresh survival.
 * Uses Dexie for type-safe IndexedDB access.
 */

import Dexie, { type Table } from 'dexie';
import type { Book, ReadingProgress } from '../types/cinematifier';

// ─── Database Schema ──────────────────────────────────────────

class CinematifierDatabase extends Dexie {
    books!: Table<Book>;
    readingProgress!: Table<ReadingProgress>;

    constructor() {
        super('CinematifierDB');
        // v1 used "novels" table; v2 migrates to "books"
        this.version(1).stores({
            novels: 'id, title, createdAt',
            readingProgress: 'id, bookId, lastReadAt',
        });
        this.version(2)
            .stores({
                novels: null, // Drop legacy table
                books: 'id, title, createdAt',
                readingProgress: 'id, bookId, lastReadAt',
            })
            .upgrade(async tx => {
                // Migrate any existing novels to the books table
                const novels = await (tx as unknown as { novels: Table<Book> }).novels?.toArray();
                if (novels?.length) {
                    const booksTable = (tx as unknown as { books: Table<Book> }).books;
                    for (const novel of novels) {
                        await booksTable.put({
                            ...novel,
                            genre:
                                ((novel as unknown as Record<string, unknown>)
                                    .genre as Book['genre']) ?? 'other',
                            status:
                                ((novel as unknown as Record<string, unknown>)
                                    .status as Book['status']) ?? 'ready',
                            totalChapters: novel.chapters?.length ?? 0,
                            processedChapters:
                                novel.chapters?.filter(ch => ch.isProcessed).length ?? 0,
                            isPublic: false,
                        });
                    }
                }
            });
    }
}

const db = new CinematifierDatabase();

// ─── Book Operations ─────────────────────────────────────────

/** Save or update a book in IndexedDB */
export async function saveBook(book: Book): Promise<void> {
    await db.books.put(book);
}

/** Load the most recently created book */
export async function loadLatestBook(): Promise<Book | null> {
    const book = await db.books.orderBy('createdAt').last();
    return book ?? null;
}

// ─── ReadingProgress Operations ───────────────────────────────

/** Save or update reading progress */
export async function saveReadingProgress(progress: ReadingProgress): Promise<void> {
    await db.readingProgress.put(progress);
}

/** Load reading progress for a specific book */
export async function loadReadingProgress(bookId: string): Promise<ReadingProgress | null> {
    const progress = await db.readingProgress.where('bookId').equals(bookId).first();
    return progress ?? null;
}
