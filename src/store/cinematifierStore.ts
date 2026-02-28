/**
 * cinematifierStore.ts — Zustand Store for Cinematifier
 *
 * Manages state for the PDF-to-Cinematic reading experience.
 * Includes Book, Chapter, and ReadingProgress entity management.
 */

import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type {
    Chapter,
    ReaderMode,
    ImmersionLevel,
    ProcessingProgress,
    Book,
    ReadingProgress,
} from '../types/cinematifier';
import type { AIConfig } from '../lib/ai';
import { encrypt, decrypt, deobfuscateLegacy, isLegacyEncryption } from '../lib/crypto';

// ─── API Key Encryption ──────────────────────────────────────────────────────
// Uses AES-GCM encryption via SubtleCrypto with a device-derived key.
// API keys are encrypted before persisting to localStorage.

const API_KEY_FIELDS = [
    'geminiKey',
    'openAiKey',
    'anthropicKey',
    'groqKey',
    'deepseekKey',
] as const;

// ─── Custom Storage with Async Encryption ────────────────────────────────────

const encryptedStorage: StateStorage = {
    getItem: (name: string): string | null => {
        // Return raw value; async decryption happens in onRehydrateStorage
        return localStorage.getItem(name);
    },
    setItem: (name: string, value: string): void => {
        // Store immediately; encryption is handled in partialize
        localStorage.setItem(name, value);
    },
    removeItem: (name: string): void => {
        localStorage.removeItem(name);
    },
};

// Track encrypted key cache for sync-to-async bridge
const encryptedKeyCache = new Map<string, string>();

/**
 * Encrypt API keys asynchronously and cache results.
 * Called before partialize to ensure encrypted values are available.
 */
async function encryptApiKeys(state: CinematifierState): Promise<void> {
    const promises = API_KEY_FIELDS.map(async field => {
        const value = state[field];
        if (value) {
            const encrypted = await encrypt(value);
            encryptedKeyCache.set(field, encrypted);
        } else {
            encryptedKeyCache.set(field, '');
        }
    });
    await Promise.all(promises);
}

/**
 * Decrypt API keys from persisted state.
 * Handles migration from legacy XOR obfuscation to AES-GCM.
 */
async function decryptApiKeys(
    stored: Partial<CinematifierState>,
): Promise<Partial<CinematifierState>> {
    const decrypted = { ...stored };

    for (const field of API_KEY_FIELDS) {
        const encoded = stored[field] ?? '';
        if (!encoded) {
            (decrypted as Record<string, string>)[field] = '';
            continue;
        }

        // Migrate legacy XOR-obfuscated keys to AES-GCM
        if (isLegacyEncryption(encoded)) {
            const plain = deobfuscateLegacy(encoded);
            (decrypted as Record<string, string>)[field] = plain;
            // Migration: re-encrypt on next save
        } else {
            const plain = await decrypt(encoded);
            (decrypted as Record<string, string>)[field] = plain;
        }
    }

    return decrypted;
}

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
    lineSpacing: number;
    immersionLevel: ImmersionLevel;
    dyslexiaFont: boolean;
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
    setLineSpacing: (spacing: number) => void;
    setImmersionLevel: (level: ImmersionLevel) => void;
    toggleDyslexiaFont: () => void;
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
            lineSpacing: 1.8,
            immersionLevel: 'balanced' as ImmersionLevel,
            dyslexiaFont: false,
            darkMode:
                typeof window !== 'undefined'
                    ? window.matchMedia('(prefers-color-scheme: dark)').matches
                    : true,

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

            setLineSpacing: (spacing: number) =>
                set({ lineSpacing: Math.max(1.4, Math.min(2.4, spacing)) }),

            setImmersionLevel: (level: ImmersionLevel) => set({ immersionLevel: level }),

            toggleDyslexiaFont: () => set(state => ({ dyslexiaFont: !state.dyslexiaFont })),

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
            storage: createJSONStorage(() => encryptedStorage),
            partialize: state => {
                // Trigger async encryption for next persist cycle (fire-and-forget)
                void encryptApiKeys(state);

                // Return with cached encrypted keys (or empty on first run)
                return {
                    readerMode: state.readerMode,
                    fontSize: state.fontSize,
                    lineSpacing: state.lineSpacing,
                    immersionLevel: state.immersionLevel,
                    dyslexiaFont: state.dyslexiaFont,
                    darkMode: state.darkMode,
                    aiProvider: state.aiProvider,
                    geminiKey: encryptedKeyCache.get('geminiKey') ?? '',
                    useSearchGrounding: state.useSearchGrounding,
                    openAiKey: encryptedKeyCache.get('openAiKey') ?? '',
                    anthropicKey: encryptedKeyCache.get('anthropicKey') ?? '',
                    groqKey: encryptedKeyCache.get('groqKey') ?? '',
                    deepseekKey: encryptedKeyCache.get('deepseekKey') ?? '',
                    ollamaUrl: state.ollamaUrl,
                    ollamaModel: state.ollamaModel,
                };
            },
            merge: (persisted, current) => {
                const stored = persisted as Partial<CinematifierState>;
                // Initial sync merge — keys stay encrypted temporarily
                return {
                    ...current,
                    ...stored,
                    // API keys will be decrypted asynchronously in onRehydrateStorage
                    geminiKey: '',
                    openAiKey: '',
                    anthropicKey: '',
                    groqKey: '',
                    deepseekKey: '',
                };
            },
            onRehydrateStorage: () => {
                // Called after initial hydration — now decrypt keys asynchronously
                return async (state, error) => {
                    if (error || !state) {
                        console.error('[Store] Rehydration error:', error);
                        return;
                    }

                    // Read raw persisted data to get encrypted keys
                    const rawData = localStorage.getItem('cinematifier-storage');
                    if (!rawData) return;

                    try {
                        const parsed = JSON.parse(rawData);
                        const storedState = parsed.state as Partial<CinematifierState>;

                        // Decrypt API keys
                        const decrypted = await decryptApiKeys(storedState);

                        // Update state with decrypted keys
                        useCinematifierStore.setState({
                            geminiKey: decrypted.geminiKey ?? '',
                            openAiKey: decrypted.openAiKey ?? '',
                            anthropicKey: decrypted.anthropicKey ?? '',
                            groqKey: decrypted.groqKey ?? '',
                            deepseekKey: decrypted.deepseekKey ?? '',
                        });

                        // Pre-populate encryption cache for future saves
                        await encryptApiKeys(useCinematifierStore.getState());
                    } catch (e) {
                        console.error('[Store] Key decryption failed:', e);
                    }
                };
            },
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
