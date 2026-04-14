import type { Book, Chapter } from '../../types/cinematifier';

export interface BookManagerOptions {
    storageKey?: string;
}

const DEFAULT_STORAGE_KEY = 'infinitycn:library:books';

function cloneBook(book: Book): Book {
    if (typeof structuredClone === 'function') {
        return structuredClone(book);
    }

    return JSON.parse(JSON.stringify(book)) as Book;
}

function isBookShape(value: unknown): value is Book {
    if (!value || typeof value !== 'object') return false;

    const candidate = value as Partial<Book>;
    return (
        typeof candidate.id === 'string' &&
        typeof candidate.title === 'string' &&
        Array.isArray(candidate.chapters)
    );
}

/**
 * BookManager
 *
 * Local-first library manager for Book/Chapter entities.
 * Persists to localStorage when available and always keeps an in-memory cache.
 */
export class BookManager {
    private readonly storageKey: string;
    private readonly books = new Map<string, Book>();
    private hydrated = false;

    constructor(options: BookManagerOptions = {}) {
        this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    }

    private getStorage(): Storage | null {
        if (typeof window === 'undefined') return null;

        try {
            return window.localStorage;
        } catch {
            return null;
        }
    }

    private hydrate(): void {
        if (this.hydrated) return;
        this.hydrated = true;

        const storage = this.getStorage();
        if (!storage) return;

        try {
            const raw = storage.getItem(this.storageKey);
            if (!raw) return;

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return;

            for (const item of parsed) {
                if (!isBookShape(item)) continue;
                this.books.set(item.id, cloneBook(item));
            }
        } catch {
            // Ignore malformed persisted payload and use in-memory state only.
        }
    }

    private persist(): void {
        const storage = this.getStorage();
        if (!storage) return;

        try {
            const payload = [...this.books.values()].map(book => cloneBook(book));
            storage.setItem(this.storageKey, JSON.stringify(payload));
        } catch {
            // Ignore localStorage quota/unavailability errors.
        }
    }

    /** Store or update a book in the library. */
    storeBook(book: Book): Book {
        this.hydrate();

        const stored: Book = {
            ...cloneBook(book),
            updatedAt: Date.now(),
        };

        this.books.set(stored.id, stored);
        this.persist();
        return cloneBook(stored);
    }

    /** Return all books currently in the library. */
    listBooks(): Book[] {
        this.hydrate();
        return [...this.books.values()]
            .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))
            .map(book => cloneBook(book));
    }

    /** Retrieve a single book by id. */
    getBookById(bookId: string): Book | null {
        this.hydrate();

        const book = this.books.get(bookId);
        return book ? cloneBook(book) : null;
    }

    /**
     * Group chapters by their parent book id for quick library views.
     * Output shape: { [bookId]: Chapter[] }
     */
    groupChapters(): Record<string, Chapter[]> {
        this.hydrate();

        const grouped: Record<string, Chapter[]> = {};
        for (const [bookId, book] of this.books) {
            grouped[bookId] = book.chapters.map(chapter => ({ ...chapter }));
        }

        return grouped;
    }

    /** Retrieve all chapters for a given book id. */
    getChaptersByBookId(bookId: string): Chapter[] {
        this.hydrate();

        const book = this.books.get(bookId);
        if (!book) return [];
        return book.chapters.map(chapter => ({ ...chapter }));
    }

    /** Delete a book by id. Returns true if a book was removed. */
    deleteBook(bookId: string): boolean {
        this.hydrate();

        const deleted = this.books.delete(bookId);
        if (deleted) {
            this.persist();
        }

        return deleted;
    }

    /** Clear all books from memory and persisted storage. */
    clear(): void {
        this.books.clear();
        this.hydrated = true;

        const storage = this.getStorage();
        if (!storage) return;
        try {
            storage.removeItem(this.storageKey);
        } catch {
            // Ignore localStorage availability errors.
        }
    }
}
