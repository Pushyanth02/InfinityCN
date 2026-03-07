/**
 * cinematifierStore.test.ts — Unit tests for the Zustand store
 *
 * Covers:
 *   • getCinematifierAIConfig   — snapshot helper that reads from store
 *   • useCinematifierStore actions — setBook, setReaderMode, setCurrentChapter,
 *     setFontSize, setLineSpacing, setImmersionLevel, toggleDyslexiaFont,
 *     toggleDarkMode, setProcessing, setProgress, setError, setAiConfig, reset
 *   • ReadingProgress actions  — setReadingProgress, updateReadingProgress,
 *     markChapterRead, addReadingTime, toggleBookmark
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock Dexie to avoid IndexedDB in jsdom
vi.mock('dexie', () => {
    class MockDexie {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        constructor(_name: string) {}
        version() {
            return { stores: () => ({ upgrade: () => ({}) }) };
        }
    }
    return { default: MockDexie };
});

// Mock cinematifierDb to avoid database side effects
vi.mock('../../lib/cinematifierDb', () => ({
    saveBook: vi.fn().mockResolvedValue(undefined),
    loadLatestBook: vi.fn().mockResolvedValue(null),
    saveReadingProgress: vi.fn().mockResolvedValue(undefined),
    loadReadingProgress: vi.fn().mockResolvedValue(null),
}));

// Mock crypto to avoid Web Crypto API (not meaningful in jsdom for key derivation)
vi.mock('../../lib/crypto', () => ({
    encrypt: vi.fn().mockResolvedValue('encrypted'),
    decrypt: vi.fn().mockResolvedValue(''),
    deobfuscateLegacy: vi.fn().mockReturnValue(''),
    isLegacyEncryption: vi.fn().mockReturnValue(false),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { useCinematifierStore, getCinematifierAIConfig } from '../cinematifierStore';
import type { CinematifierState } from '../cinematifierStore';
import type { Book, ReadingProgress, ProcessingProgress } from '../../types/cinematifier';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeBook(overrides: Partial<Book> = {}): Book {
    return {
        id: 'book-1',
        title: 'Test Novel',
        genre: 'fantasy',
        status: 'ready',
        totalChapters: 1,
        processedChapters: 0,
        isPublic: false,
        chapters: [],
        totalWordCount: 1000,
        createdAt: Date.now(),
        ...overrides,
    };
}

function makeProgress(overrides: Partial<ReadingProgress> = {}): ReadingProgress {
    return {
        id: 'progress-book-1',
        bookId: 'book-1',
        currentChapter: 1,
        scrollPosition: 0,
        readingMode: 'cinematified',
        bookmarks: [],
        completed: false,
        lastReadAt: Date.now(),
        readChapters: [],
        totalReadTime: 0,
        ...overrides,
    };
}

// ─── Reset store state before each test ──────────────────────────────────────

beforeEach(() => {
    useCinematifierStore.getState().reset();
});

// ─── getCinematifierAIConfig ──────────────────────────────────────────────────

describe('getCinematifierAIConfig', () => {
    it('returns an AIConfig object with all required fields', () => {
        const config = getCinematifierAIConfig();
        expect(config.provider).toBeDefined();
        expect(typeof config.geminiKey).toBe('string');
        expect(typeof config.openAiKey).toBe('string');
        expect(typeof config.anthropicKey).toBe('string');
        expect(typeof config.groqKey).toBe('string');
        expect(typeof config.deepseekKey).toBe('string');
        expect(typeof config.ollamaUrl).toBe('string');
        expect(typeof config.ollamaModel).toBe('string');
        expect(typeof config.useSearchGrounding).toBe('boolean');
    });

    it('reflects store aiProvider changes', () => {
        useCinematifierStore.getState().setAiConfig({ aiProvider: 'gemini' });
        const config = getCinematifierAIConfig();
        expect(config.provider).toBe('gemini');
    });

    it('reflects store geminiKey changes', () => {
        useCinematifierStore.getState().setAiConfig({ geminiKey: 'my-key' });
        const config = getCinematifierAIConfig();
        expect(config.geminiKey).toBe('my-key');
    });
});

// ─── Book actions ─────────────────────────────────────────────────────────────

describe('store — book actions', () => {
    it('setBook stores the book', () => {
        const book = makeBook();
        useCinematifierStore.getState().setBook(book);
        expect(useCinematifierStore.getState().book?.id).toBe('book-1');
    });

    it('setBook(null) clears the book', () => {
        useCinematifierStore.getState().setBook(makeBook());
        useCinematifierStore.getState().setBook(null);
        expect(useCinematifierStore.getState().book).toBeNull();
    });

    it('updateBook patches the book', () => {
        useCinematifierStore.getState().setBook(makeBook({ title: 'Old Title' }));
        useCinematifierStore.getState().updateBook({ title: 'New Title' });
        expect(useCinematifierStore.getState().book?.title).toBe('New Title');
    });

    it('updateBook is a no-op when no book exists', () => {
        // Should not throw
        expect(() => useCinematifierStore.getState().updateBook({ title: 'X' })).not.toThrow();
    });
});

// ─── Reader actions ───────────────────────────────────────────────────────────

describe('store — reader actions', () => {
    it('setReaderMode updates readerMode', () => {
        useCinematifierStore.getState().setReaderMode('original');
        expect(useCinematifierStore.getState().readerMode).toBe('original');
    });

    it('setCurrentChapter updates currentChapterIndex', () => {
        // setCurrentChapter guards: book must exist and index must be in range
        const book = makeBook({
            chapters: [
                {
                    id: 'ch-0',
                    bookId: 'book-1',
                    number: 1,
                    title: 'Ch 1',
                    originalText: 'text',
                    cinematifiedBlocks: [],
                    status: 'pending',
                    isProcessed: false,
                    wordCount: 1,
                    estimatedReadTime: 1,
                },
                {
                    id: 'ch-1',
                    bookId: 'book-1',
                    number: 2,
                    title: 'Ch 2',
                    originalText: 'text',
                    cinematifiedBlocks: [],
                    status: 'pending',
                    isProcessed: false,
                    wordCount: 1,
                    estimatedReadTime: 1,
                },
                {
                    id: 'ch-2',
                    bookId: 'book-1',
                    number: 3,
                    title: 'Ch 3',
                    originalText: 'text',
                    cinematifiedBlocks: [],
                    status: 'pending',
                    isProcessed: false,
                    wordCount: 1,
                    estimatedReadTime: 1,
                },
                {
                    id: 'ch-3',
                    bookId: 'book-1',
                    number: 4,
                    title: 'Ch 4',
                    originalText: 'text',
                    cinematifiedBlocks: [],
                    status: 'pending',
                    isProcessed: false,
                    wordCount: 1,
                    estimatedReadTime: 1,
                },
            ],
        });
        useCinematifierStore.getState().setBook(book);
        useCinematifierStore.getState().setCurrentChapter(3);
        expect(useCinematifierStore.getState().currentChapterIndex).toBe(3);
    });

    it('setFontSize updates fontSize', () => {
        useCinematifierStore.getState().setFontSize(22);
        expect(useCinematifierStore.getState().fontSize).toBe(22);
    });

    it('setLineSpacing updates lineSpacing', () => {
        useCinematifierStore.getState().setLineSpacing(2.0);
        expect(useCinematifierStore.getState().lineSpacing).toBe(2.0);
    });

    it('setImmersionLevel updates immersionLevel', () => {
        useCinematifierStore.getState().setImmersionLevel('cinematic');
        expect(useCinematifierStore.getState().immersionLevel).toBe('cinematic');
    });

    it('toggleDyslexiaFont toggles between true and false', () => {
        const initial = useCinematifierStore.getState().dyslexiaFont;
        useCinematifierStore.getState().toggleDyslexiaFont();
        expect(useCinematifierStore.getState().dyslexiaFont).toBe(!initial);
        useCinematifierStore.getState().toggleDyslexiaFont();
        expect(useCinematifierStore.getState().dyslexiaFont).toBe(initial);
    });

    it('toggleDarkMode toggles between true and false', () => {
        const initial = useCinematifierStore.getState().darkMode;
        useCinematifierStore.getState().toggleDarkMode();
        expect(useCinematifierStore.getState().darkMode).toBe(!initial);
    });
});

// ─── Processing actions ───────────────────────────────────────────────────────

describe('store — processing actions', () => {
    it('setProcessing updates isProcessing', () => {
        useCinematifierStore.getState().setProcessing(true);
        expect(useCinematifierStore.getState().isProcessing).toBe(true);
        useCinematifierStore.getState().setProcessing(false);
        expect(useCinematifierStore.getState().isProcessing).toBe(false);
    });

    it('setProgress updates processingProgress', () => {
        const progress: ProcessingProgress = {
            currentChapter: 1,
            totalChapters: 5,
            phase: 'cinematifying',
            message: 'Working...',
            percentComplete: 20,
        };
        useCinematifierStore.getState().setProgress(progress);
        expect(useCinematifierStore.getState().processingProgress?.currentChapter).toBe(1);
        expect(useCinematifierStore.getState().processingProgress?.phase).toBe('cinematifying');
    });

    it('setError stores the error string', () => {
        useCinematifierStore.getState().setError('Something went wrong');
        expect(useCinematifierStore.getState().error).toBe('Something went wrong');
    });

    it('setError(null) clears the error', () => {
        useCinematifierStore.getState().setError('Err');
        useCinematifierStore.getState().setError(null);
        expect(useCinematifierStore.getState().error).toBeNull();
    });
});

// ─── AI config actions ────────────────────────────────────────────────────────

describe('store — AI config actions', () => {
    it('setAiConfig updates aiProvider', () => {
        useCinematifierStore.getState().setAiConfig({ aiProvider: 'openai' });
        expect(useCinematifierStore.getState().aiProvider).toBe('openai');
    });

    it('setAiConfig updates ollamaUrl', () => {
        useCinematifierStore.getState().setAiConfig({ ollamaUrl: 'http://myserver:11434' });
        expect(useCinematifierStore.getState().ollamaUrl).toBe('http://myserver:11434');
    });

    it('setAiConfig updates useSearchGrounding', () => {
        useCinematifierStore.getState().setAiConfig({ useSearchGrounding: true });
        expect(useCinematifierStore.getState().useSearchGrounding).toBe(true);
    });

    it('setAiConfig does partial updates (no other fields changed)', () => {
        useCinematifierStore.getState().setAiConfig({ aiProvider: 'groq', groqKey: 'abc' });
        useCinematifierStore.getState().setAiConfig({ aiProvider: 'openai' });
        // groqKey should remain unchanged after the second setAiConfig
        expect(useCinematifierStore.getState().groqKey).toBe('abc');
    });
});

// ─── ReadingProgress actions ─────────────────────────────────────────────────

describe('store — ReadingProgress actions', () => {
    it('setReadingProgress stores progress', () => {
        const prog = makeProgress();
        useCinematifierStore.getState().setReadingProgress(prog);
        expect(useCinematifierStore.getState().readingProgress?.id).toBe('progress-book-1');
    });

    it('setReadingProgress(null) clears progress', () => {
        useCinematifierStore.getState().setReadingProgress(makeProgress());
        useCinematifierStore.getState().setReadingProgress(null);
        expect(useCinematifierStore.getState().readingProgress).toBeNull();
    });

    it('updateReadingProgress patches existing progress', () => {
        useCinematifierStore.getState().setReadingProgress(makeProgress({ scrollPosition: 0 }));
        useCinematifierStore.getState().updateReadingProgress({ scrollPosition: 500 });
        expect(useCinematifierStore.getState().readingProgress?.scrollPosition).toBe(500);
    });

    it('markChapterRead adds chapter number to readChapters', () => {
        useCinematifierStore.getState().setReadingProgress(makeProgress({ readChapters: [] }));
        useCinematifierStore.getState().markChapterRead(2);
        expect(useCinematifierStore.getState().readingProgress?.readChapters).toContain(2);
    });

    it('markChapterRead does not add duplicates', () => {
        useCinematifierStore.getState().setReadingProgress(makeProgress({ readChapters: [2] }));
        useCinematifierStore.getState().markChapterRead(2);
        const chapters = useCinematifierStore.getState().readingProgress?.readChapters ?? [];
        expect(chapters.filter(n => n === 2)).toHaveLength(1);
    });

    it('addReadingTime increments totalReadTime', () => {
        useCinematifierStore.getState().setReadingProgress(makeProgress({ totalReadTime: 100 }));
        useCinematifierStore.getState().addReadingTime(30);
        expect(useCinematifierStore.getState().readingProgress?.totalReadTime).toBe(130);
    });

    it('toggleBookmark adds a bookmark if not present', () => {
        useCinematifierStore.getState().setReadingProgress(makeProgress({ bookmarks: [] }));
        useCinematifierStore.getState().toggleBookmark(3);
        expect(useCinematifierStore.getState().readingProgress?.bookmarks).toContain(3);
    });

    it('toggleBookmark removes a bookmark if already present', () => {
        useCinematifierStore.getState().setReadingProgress(makeProgress({ bookmarks: [3] }));
        useCinematifierStore.getState().toggleBookmark(3);
        expect(useCinematifierStore.getState().readingProgress?.bookmarks).not.toContain(3);
    });
});

// ─── reset ────────────────────────────────────────────────────────────────────

describe('store — reset', () => {
    it('reset clears book, readingProgress, and errors', () => {
        useCinematifierStore.getState().setBook(makeBook());
        useCinematifierStore.getState().setReadingProgress(makeProgress());
        useCinematifierStore.getState().setError('Error!');

        useCinematifierStore.getState().reset();

        const state = useCinematifierStore.getState();
        expect(state.book).toBeNull();
        expect(state.readingProgress).toBeNull();
        expect(state.error).toBeNull();
    });

    it('reset resets currentChapterIndex to 0', () => {
        useCinematifierStore.getState().setCurrentChapter(5);
        useCinematifierStore.getState().reset();
        expect(useCinematifierStore.getState().currentChapterIndex).toBe(0);
    });

    it('reset resets isProcessing to false', () => {
        useCinematifierStore.getState().setProcessing(true);
        useCinematifierStore.getState().reset();
        expect(useCinematifierStore.getState().isProcessing).toBe(false);
    });

    it('reset does not throw when nothing is set', () => {
        expect(() => useCinematifierStore.getState().reset()).not.toThrow();
    });
});

// ─── updateChapter ────────────────────────────────────────────────────────────

describe('store — updateChapter', () => {
    it('updates a specific chapter by index', () => {
        const book = makeBook({
            chapters: [
                {
                    id: 'ch-1',
                    bookId: 'book-1',
                    number: 1,
                    title: 'Chapter 1',
                    originalText: 'text',
                    cinematifiedBlocks: [],
                    status: 'pending',
                    isProcessed: false,
                    wordCount: 1,
                    estimatedReadTime: 1,
                },
            ],
        });
        useCinematifierStore.getState().setBook(book);
        useCinematifierStore.getState().updateChapter(0, { status: 'ready', isProcessed: true });
        expect(useCinematifierStore.getState().book?.chapters[0].status).toBe('ready');
        expect(useCinematifierStore.getState().book?.chapters[0].isProcessed).toBe(true);
    });
});

// ─── Type guard: state shape ──────────────────────────────────────────────────

describe('store — initial state shape', () => {
    // Note: reset() only resets book/progress/processing state, NOT settings.
    // Settings (readerMode, fontSize, immersionLevel, aiProvider, etc.) are
    // persisted via the Zustand persist middleware and survive reset().

    it('book is null after reset', () => {
        useCinematifierStore.getState().setBook(makeBook());
        useCinematifierStore.getState().reset();
        expect(useCinematifierStore.getState().book).toBeNull();
    });

    it('readingProgress is null after reset', () => {
        useCinematifierStore.getState().setReadingProgress(makeProgress());
        useCinematifierStore.getState().reset();
        expect(useCinematifierStore.getState().readingProgress).toBeNull();
    });

    it('currentChapterIndex is 0 after reset', () => {
        // setCurrentChapter requires a book — set one first
        const book = makeBook({
            chapters: [
                {
                    id: 'ch-0',
                    bookId: 'book-1',
                    number: 1,
                    title: 'Ch 1',
                    originalText: 't',
                    cinematifiedBlocks: [],
                    status: 'pending',
                    isProcessed: false,
                    wordCount: 1,
                    estimatedReadTime: 1,
                },
                {
                    id: 'ch-1',
                    bookId: 'book-1',
                    number: 2,
                    title: 'Ch 2',
                    originalText: 't',
                    cinematifiedBlocks: [],
                    status: 'pending',
                    isProcessed: false,
                    wordCount: 1,
                    estimatedReadTime: 1,
                },
            ],
        });
        useCinematifierStore.getState().setBook(book);
        useCinematifierStore.getState().setCurrentChapter(1);
        expect(useCinematifierStore.getState().currentChapterIndex).toBe(1);
        useCinematifierStore.getState().reset();
        expect(useCinematifierStore.getState().currentChapterIndex).toBe(0);
    });

    it('isProcessing is false after reset', () => {
        useCinematifierStore.getState().setProcessing(true);
        useCinematifierStore.getState().reset();
        expect(useCinematifierStore.getState().isProcessing).toBe(false);
    });

    it('error is null after reset', () => {
        useCinematifierStore.getState().setError('Err');
        useCinematifierStore.getState().reset();
        expect(useCinematifierStore.getState().error).toBeNull();
    });

    it('processingProgress is null after reset', () => {
        useCinematifierStore.getState().setProgress({
            currentChapter: 1,
            totalChapters: 3,
            phase: 'cinematifying',
            message: 'working',
            percentComplete: 33,
        });
        useCinematifierStore.getState().reset();
        expect(useCinematifierStore.getState().processingProgress).toBeNull();
    });

    it('store state satisfies the CinematifierState interface (type-level check)', () => {
        // This test passes as long as TypeScript compiles it — runtime check for runtime shape
        const state: CinematifierState = useCinematifierStore.getState();
        expect(typeof state.setBook).toBe('function');
        expect(typeof state.reset).toBe('function');
    });
});
