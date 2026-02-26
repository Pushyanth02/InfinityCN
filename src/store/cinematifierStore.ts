/**
 * cinematifierStore.ts — Zustand Store for Cinematifier
 *
 * Manages state for the PDF-to-Cinematic reading experience.
 * Includes Book, Chapter, and ReadingProgress entity management.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
    Chapter,
    ReaderMode,
    ProcessingProgress,
    Book,
    ReadingProgress,
} from '../types/cinematifier';
import type { AIConfig } from '../lib/ai';

// ─── Extended State Type ───────────────────────────────────────────────────────

export interface CinematifierState {
    // Book entity (primary data model)
    book: Book | null;

    // Reading Progress entity
    readingProgress: ReadingProgress | null;

    // Reader state
    readerMode: ReaderMode;
    currentChapterIndex: number;
    fontSize: number;
    ambientMode: boolean;
    darkMode: boolean;

    // Processing
    isProcessing: boolean;
    processingProgress: ProcessingProgress | null;
    error: string | null;

    // AI Settings
    aiProvider:
        | 'none'
        | 'chrome'
        | 'gemini'
        | 'ollama'
        | 'openai'
        | 'anthropic'
        | 'groq'
        | 'deepseek';
    geminiKey: string;
    useSearchGrounding: boolean;
    openAiKey: string;
    anthropicKey: string;
    groqKey: string;
    deepseekKey: string;
    ollamaUrl: string;
    ollamaModel: string;

    // Book actions
    setBook: (book: Book | null) => void;
    updateBook: (updates: Partial<Book>) => void;
    updateChapter: (chapterIndex: number, updates: Partial<Chapter>) => void;

    // Reader actions
    setReaderMode: (mode: ReaderMode) => void;
    setCurrentChapter: (index: number) => void;
    setFontSize: (size: number) => void;
    toggleAmbientMode: () => void;
    toggleDarkMode: () => void;

    // Processing actions
    setProcessing: (isProcessing: boolean) => void;
    setProgress: (progress: ProcessingProgress) => void;
    setError: (error: string | null) => void;

    // AI config action
    setAiConfig: (
        config: Partial<
            Pick<
                CinematifierState,
                | 'aiProvider'
                | 'geminiKey'
                | 'useSearchGrounding'
                | 'openAiKey'
                | 'anthropicKey'
                | 'groqKey'
                | 'deepseekKey'
                | 'ollamaUrl'
                | 'ollamaModel'
            >
        >,
    ) => void;

    // ReadingProgress actions
    setReadingProgress: (progress: ReadingProgress | null) => void;
    updateReadingProgress: (updates: Partial<ReadingProgress>) => void;
    markChapterRead: (chapterNumber: number) => void;
    addReadingTime: (seconds: number) => void;
    toggleBookmark: (chapterIndex: number) => void;

    // Reset
    reset: () => void;
}

export const useCinematifierStore = create<CinematifierState>()(
    persist(
        (set, get) => ({
            // Book entity
            book: null,

            // Reading Progress entity
            readingProgress: null,

            // Reader state
            readerMode: 'cinematified' as ReaderMode,
            currentChapterIndex: 0,
            fontSize: 18,
            ambientMode: true,
            darkMode: true,

            // Processing
            isProcessing: false,
            processingProgress: null,
            error: null,

            // AI Settings
            aiProvider: 'none',
            geminiKey: '',
            useSearchGrounding: false,
            openAiKey: '',
            anthropicKey: '',
            groqKey: '',
            deepseekKey: '',
            ollamaUrl: 'http://localhost:11434',
            ollamaModel: 'llama3',

            // Book actions
            setBook: (book: Book | null) => set({ book, currentChapterIndex: 0, error: null }),

            updateBook: (updates: Partial<Book>) => {
                const { book } = get();
                if (!book) return;
                set({ book: { ...book, ...updates, updatedAt: Date.now() } });
            },

            updateChapter: (chapterIndex: number, updates: Partial<Chapter>) => {
                const { book } = get();
                if (!book || chapterIndex < 0 || chapterIndex >= book.chapters.length) return;

                const updatedChapters = [...book.chapters];
                updatedChapters[chapterIndex] = {
                    ...updatedChapters[chapterIndex],
                    ...updates,
                };

                // Track processed count and overall status
                const processedCount = updatedChapters.filter(
                    ch => ch.status === 'ready' || ch.isProcessed,
                ).length;
                const allReady = processedCount === updatedChapters.length;

                set({
                    book: {
                        ...book,
                        chapters: updatedChapters,
                        processedChapters: processedCount,
                        status: allReady ? 'ready' : book.status,
                        updatedAt: Date.now(),
                    },
                });
            },

            // Reader actions
            setReaderMode: (mode: ReaderMode) => {
                const { readingProgress } = get();
                set({ readerMode: mode });
                if (readingProgress) {
                    set({
                        readingProgress: {
                            ...readingProgress,
                            readingMode: mode,
                            lastReadAt: Date.now(),
                        },
                    });
                }
            },

            setCurrentChapter: (index: number) => {
                const { book } = get();
                if (book && index >= 0 && index < book.chapters.length) {
                    set({ currentChapterIndex: index });
                }
            },

            setFontSize: (size: number) => set({ fontSize: Math.max(12, Math.min(32, size)) }),

            toggleAmbientMode: () => set(state => ({ ambientMode: !state.ambientMode })),

            toggleDarkMode: () => set(state => ({ darkMode: !state.darkMode })),

            // Processing actions
            setProcessing: (isProcessing: boolean) => set({ isProcessing }),

            setProgress: (progress: ProcessingProgress) => set({ processingProgress: progress }),

            setError: (error: string | null) => set({ error, isProcessing: false }),

            // AI config action
            setAiConfig: (
                config: Partial<
                    Pick<
                        CinematifierState,
                        | 'aiProvider'
                        | 'geminiKey'
                        | 'useSearchGrounding'
                        | 'openAiKey'
                        | 'anthropicKey'
                        | 'groqKey'
                        | 'deepseekKey'
                        | 'ollamaUrl'
                        | 'ollamaModel'
                    >
                >,
            ) => set(config as Partial<CinematifierState>),

            // ReadingProgress actions
            setReadingProgress: (progress: ReadingProgress | null) =>
                set({ readingProgress: progress }),

            updateReadingProgress: (updates: Partial<ReadingProgress>) => {
                const { readingProgress } = get();
                if (!readingProgress) return;
                set({
                    readingProgress: {
                        ...readingProgress,
                        ...updates,
                        lastReadAt: Date.now(),
                    },
                });
            },

            markChapterRead: (chapterNumber: number) => {
                const { readingProgress, book } = get();
                if (!readingProgress) return;

                const readChapters = readingProgress.readChapters.includes(chapterNumber)
                    ? readingProgress.readChapters
                    : [...readingProgress.readChapters, chapterNumber];

                const completed = book ? readChapters.length >= book.totalChapters : false;

                set({
                    readingProgress: {
                        ...readingProgress,
                        readChapters,
                        completed,
                        lastReadAt: Date.now(),
                    },
                });
            },

            addReadingTime: (seconds: number) => {
                const { readingProgress } = get();
                if (!readingProgress) return;
                set({
                    readingProgress: {
                        ...readingProgress,
                        totalReadTime: readingProgress.totalReadTime + seconds,
                        lastReadAt: Date.now(),
                    },
                });
            },

            toggleBookmark: (chapterIndex: number) => {
                const { readingProgress } = get();
                if (!readingProgress) return;
                const bookmarks = readingProgress.bookmarks.includes(chapterIndex)
                    ? readingProgress.bookmarks.filter(i => i !== chapterIndex)
                    : [...readingProgress.bookmarks, chapterIndex];
                set({
                    readingProgress: {
                        ...readingProgress,
                        bookmarks,
                        lastReadAt: Date.now(),
                    },
                });
            },

            // Reset
            reset: () =>
                set({
                    book: null,
                    readingProgress: null,
                    currentChapterIndex: 0,
                    isProcessing: false,
                    processingProgress: null,
                    error: null,
                }),
        }),
        {
            name: 'cinematifier-storage',
            partialize: state => ({
                readerMode: state.readerMode,
                fontSize: state.fontSize,
                ambientMode: state.ambientMode,
                darkMode: state.darkMode,
                aiProvider: state.aiProvider,
                geminiKey: state.geminiKey,
                useSearchGrounding: state.useSearchGrounding,
                openAiKey: state.openAiKey,
                anthropicKey: state.anthropicKey,
                groqKey: state.groqKey,
                deepseekKey: state.deepseekKey,
                ollamaUrl: state.ollamaUrl,
                ollamaModel: state.ollamaModel,
            }),
        },
    ),
);

/** Snapshot the current AI config from the store */
export function getCinematifierAIConfig(): AIConfig {
    const s = useCinematifierStore.getState();
    return {
        provider: s.aiProvider,
        geminiKey: s.geminiKey,
        useSearchGrounding: s.useSearchGrounding,
        openAiKey: s.openAiKey,
        anthropicKey: s.anthropicKey,
        groqKey: s.groqKey,
        deepseekKey: s.deepseekKey,
        ollamaUrl: s.ollamaUrl,
        ollamaModel: s.ollamaModel,
    };
}
