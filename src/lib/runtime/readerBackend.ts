import type { Book, EmotionCategory, ReadingProgress, ReaderMode } from '../../types/cinematifier';

const TELEMETRY_STORAGE_KEY = 'cinematifier:reader-telemetry:v1';
const MAX_SNAPSHOTS_PER_BOOK = 720;
const SESSION_BREAK_MS = 20 * 60 * 1000;

type TelemetryStore = Record<string, ReaderTelemetrySnapshot[]>;

export interface ReaderTelemetrySnapshot {
    bookId: string;
    chapterNumber: number;
    readerMode: ReaderMode;
    scrollRatio: number;
    totalReadTimeSec: number;
    timestamp: number;
}

export interface ReaderAnalyticsSummary {
    wordsReadEstimate: number;
    completionPercent: number;
    averageWordsPerMinute: number;
    estimatedMinutesRemaining: number;
    todayReadingMinutes: number;
    sessionCount: number;
    lastActiveAt?: number;
    cinematicSceneCount: number;
    cinematicCueCount: number;
    cinematicAverageTension: number;
    cinematicDominantEmotion?: EmotionCategory;
}

let hydrated = false;
const inMemoryStore: TelemetryStore = {};

function getStorage(): Storage | null {
    if (typeof window === 'undefined') return null;

    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function sanitizeSnapshot(raw: ReaderTelemetrySnapshot): ReaderTelemetrySnapshot {
    return {
        ...raw,
        scrollRatio: clamp(raw.scrollRatio, 0, 1),
        totalReadTimeSec: Math.max(0, Math.round(raw.totalReadTimeSec)),
        timestamp: Number.isFinite(raw.timestamp) ? Math.round(raw.timestamp) : Date.now(),
    };
}

function hydrate(): void {
    if (hydrated) return;
    hydrated = true;

    const storage = getStorage();
    if (!storage) return;

    try {
        const raw = storage.getItem(TELEMETRY_STORAGE_KEY);
        if (!raw) return;

        const parsed = JSON.parse(raw) as TelemetryStore;
        if (!parsed || typeof parsed !== 'object') return;

        for (const [bookId, snapshots] of Object.entries(parsed)) {
            if (!Array.isArray(snapshots)) continue;
            inMemoryStore[bookId] = snapshots
                .filter(snapshot => snapshot && typeof snapshot === 'object')
                .map(snapshot => sanitizeSnapshot(snapshot as ReaderTelemetrySnapshot))
                .sort((a, b) => a.timestamp - b.timestamp)
                .slice(-MAX_SNAPSHOTS_PER_BOOK);
        }
    } catch {
        // Ignore malformed local cache and continue with empty in-memory store.
    }
}

function persist(): void {
    const storage = getStorage();
    if (!storage) return;

    try {
        storage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(inMemoryStore));
    } catch {
        // Ignore quota or storage unavailability issues.
    }
}

export function recordReaderTelemetrySnapshot(snapshot: ReaderTelemetrySnapshot): void {
    hydrate();

    const normalized = sanitizeSnapshot(snapshot);
    const history = inMemoryStore[normalized.bookId] ?? [];
    const previous = history[history.length - 1];

    // Skip nearly-identical samples written too frequently.
    if (previous) {
        const elapsed = normalized.timestamp - previous.timestamp;
        const sameChapter = previous.chapterNumber === normalized.chapterNumber;
        const sameMode = previous.readerMode === normalized.readerMode;
        const tinyProgressDelta = Math.abs(previous.scrollRatio - normalized.scrollRatio) < 0.02;

        if (elapsed < 20_000 && sameChapter && sameMode && tinyProgressDelta) {
            return;
        }
    }

    const nextHistory = [...history, normalized].slice(-MAX_SNAPSHOTS_PER_BOOK);
    inMemoryStore[normalized.bookId] = nextHistory;
    persist();
}

export function listReaderTelemetrySnapshots(
    bookId: string,
    limit = MAX_SNAPSHOTS_PER_BOOK,
): ReaderTelemetrySnapshot[] {
    hydrate();

    const history = inMemoryStore[bookId] ?? [];
    if (limit <= 0) return [];

    return history.slice(-limit);
}

function computeSessionCount(snapshots: ReaderTelemetrySnapshot[]): number {
    if (snapshots.length === 0) return 0;

    let sessions = 1;
    for (let i = 1; i < snapshots.length; i++) {
        if (snapshots[i].timestamp - snapshots[i - 1].timestamp > SESSION_BREAK_MS) {
            sessions += 1;
        }
    }

    return sessions;
}

function getCurrentChapter(book: Book, progress: ReadingProgress) {
    const byChapterNumber = book.chapters.find(
        chapter => chapter.number === progress.currentChapter,
    );
    if (byChapterNumber) return byChapterNumber;

    const byIndex = book.chapters[progress.currentChapter - 1];
    return byIndex ?? null;
}

function computeDominantEmotion(values: EmotionCategory[]): EmotionCategory | undefined {
    if (values.length === 0) return undefined;

    const counts = new Map<EmotionCategory, number>();
    for (const value of values) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
    }

    let dominant: EmotionCategory | undefined;
    let maxCount = 0;
    for (const [emotion, count] of counts) {
        if (count > maxCount) {
            dominant = emotion;
            maxCount = count;
        }
    }

    return dominant;
}

function estimateWordsRead(book: Book, progress: ReadingProgress): number {
    const byChapterNumber = new Map<number, number>();
    for (const chapter of book.chapters) {
        byChapterNumber.set(chapter.number, chapter.wordCount);
    }

    const finishedWordCount = progress.readChapters.reduce(
        (sum, chapterNumber) => sum + (byChapterNumber.get(chapterNumber) ?? 0),
        0,
    );

    const currentChapterWordCount = byChapterNumber.get(progress.currentChapter) ?? 0;
    const latestSnapshot = listReaderTelemetrySnapshots(book.id, 1)[0];
    const currentChapterEstimate = progress.readChapters.includes(progress.currentChapter)
        ? 0
        : Math.round(currentChapterWordCount * (latestSnapshot?.scrollRatio ?? 0));

    return clamp(finishedWordCount + currentChapterEstimate, 0, book.totalWordCount);
}

export function getReaderAnalyticsSummary(
    book: Book | null,
    progress: ReadingProgress | null,
): ReaderAnalyticsSummary | null {
    if (!book || !progress) return null;

    const snapshots = listReaderTelemetrySnapshots(book.id);
    const wordsReadEstimate = estimateWordsRead(book, progress);

    const totalMinutes = Math.max(1, progress.totalReadTime / 60);
    const averageWordsPerMinute = Math.round(wordsReadEstimate / totalMinutes);

    const fallbackWpm = averageWordsPerMinute > 0 ? averageWordsPerMinute : 170;
    const remainingWords = Math.max(0, book.totalWordCount - wordsReadEstimate);
    const estimatedMinutesRemaining = Math.ceil(remainingWords / fallbackWpm);
    const completionPercent =
        book.totalWordCount > 0 ? Math.round((wordsReadEstimate / book.totalWordCount) * 100) : 0;

    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const todaySnapshots = snapshots.filter(snapshot => snapshot.timestamp >= oneDayAgo);
    const todayReadingMinutes = Math.round((todaySnapshots.length * 45) / 60);

    const currentChapter = getCurrentChapter(book, progress);
    const blockTensionValues = (currentChapter?.cinematifiedBlocks ?? [])
        .map(block => block.tensionScore)
        .filter((value): value is number => typeof value === 'number');
    const blockEmotions = (currentChapter?.cinematifiedBlocks ?? [])
        .map(block => block.emotion)
        .filter((value): value is EmotionCategory => Boolean(value));

    const cinematicAverageTension =
        blockTensionValues.length > 0
            ? Math.round(
                  blockTensionValues.reduce((sum, value) => sum + value, 0) /
                      blockTensionValues.length,
              )
            : 0;

    const cinematicSceneCount =
        currentChapter?.renderPlan?.scenes.length ?? currentChapter?.cinematizedScenes?.length ?? 0;
    const cinematicCueCount =
        currentChapter?.renderPlan?.cues.length ?? currentChapter?.cinematifiedBlocks.length ?? 0;

    return {
        wordsReadEstimate,
        completionPercent: clamp(completionPercent, 0, 100),
        averageWordsPerMinute: Math.max(0, averageWordsPerMinute),
        estimatedMinutesRemaining,
        todayReadingMinutes,
        sessionCount: computeSessionCount(todaySnapshots),
        lastActiveAt: snapshots[snapshots.length - 1]?.timestamp ?? progress.lastReadAt,
        cinematicSceneCount,
        cinematicCueCount,
        cinematicAverageTension,
        cinematicDominantEmotion: computeDominantEmotion(blockEmotions),
    };
}

export function clearReaderTelemetry(bookId?: string): void {
    hydrate();

    if (bookId) {
        delete inMemoryStore[bookId];
    } else {
        for (const key of Object.keys(inMemoryStore)) {
            delete inMemoryStore[key];
        }
    }

    persist();
}
