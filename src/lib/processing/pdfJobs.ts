export type PDFJobStatus = 'created' | 'processing' | 'complete';

export interface PDFJob {
    id: string;
    fileName: string;
    status: PDFJobStatus;
    progress: number;
    result: string | null;
    sourceText?: string | null;
    partialResult?: string | null;
    processedChunks?: number;
    totalChunks?: number;
    createdAt: number;
    updatedAt: number;
}

const STORAGE_KEY = 'infinitycn:pdf-jobs';
const MAX_STORED_JOBS = 30;
const MAX_PERSISTED_SOURCE_CHARS = 60000;
const MAX_PERSISTED_PARTIAL_CHARS = 30000;
const MAX_PERSISTED_RESULT_CHARS = 20000;

const inMemoryJobs = new Map<string, PDFJob>();
let hydrated = false;
let lastTimestamp = 0;

function getLocalStorage(): Storage | null {
    if (typeof window === 'undefined') return null;
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function clampProgress(value: number): number {
    return Math.max(0, Math.min(100, Math.round(value)));
}

function nextTimestamp(): number {
    const now = Date.now();
    lastTimestamp = now > lastTimestamp ? now : lastTimestamp + 1;
    return lastTimestamp;
}

function copyJob(job: PDFJob): PDFJob {
    return { ...job };
}

function truncateValue(value: string | null | undefined, maxChars: number): string | null {
    if (!value) return null;
    if (value.length <= maxChars) return value;
    return value.slice(0, maxChars);
}

function toPersistedJob(job: PDFJob): PDFJob {
    return {
        ...job,
        sourceText: truncateValue(job.sourceText ?? null, MAX_PERSISTED_SOURCE_CHARS),
        partialResult: truncateValue(job.partialResult ?? null, MAX_PERSISTED_PARTIAL_CHARS),
        result: truncateValue(job.result ?? null, MAX_PERSISTED_RESULT_CHARS),
    };
}

function isValidStoredJob(value: unknown): value is PDFJob {
    if (!value || typeof value !== 'object') return false;

    const candidate = value as Partial<PDFJob>;
    return (
        typeof candidate.id === 'string' &&
        typeof candidate.fileName === 'string' &&
        typeof candidate.status === 'string' &&
        typeof candidate.progress === 'number' &&
        (typeof candidate.result === 'string' || candidate.result === null) &&
        typeof candidate.createdAt === 'number' &&
        typeof candidate.updatedAt === 'number'
    );
}

function hydrate(): void {
    if (hydrated) return;
    hydrated = true;

    const storage = getLocalStorage();
    if (!storage) return;

    try {
        const raw = storage.getItem(STORAGE_KEY);
        if (!raw) return;

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;

        for (const item of parsed) {
            if (!isValidStoredJob(item)) continue;
            inMemoryJobs.set(item.id, {
                ...item,
                progress: clampProgress(item.progress),
            });
            lastTimestamp = Math.max(lastTimestamp, item.createdAt, item.updatedAt);
        }
    } catch {
        // Ignore malformed persisted payload and keep in-memory store empty.
    }
}

function persist(): void {
    const storage = getLocalStorage();
    if (!storage) return;

    try {
        const jobs = [...inMemoryJobs.values()]
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, MAX_STORED_JOBS)
            .map(toPersistedJob);
        storage.setItem(STORAGE_KEY, JSON.stringify(jobs));
    } catch {
        // Ignore localStorage quota/availability errors.
    }
}

function generateJobId(fileName: string): string {
    const safeName = fileName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 24);
    const random = Math.random().toString(36).slice(2, 8);
    return `pdf-job-${Date.now()}-${safeName || 'file'}-${random}`;
}

export function createJob(file: File): PDFJob {
    hydrate();

    const now = nextTimestamp();
    const job: PDFJob = {
        id: generateJobId(file.name),
        fileName: file.name,
        status: 'created',
        progress: 0,
        result: null,
        sourceText: null,
        partialResult: null,
        processedChunks: 0,
        totalChunks: 0,
        createdAt: now,
        updatedAt: now,
    };

    inMemoryJobs.set(job.id, job);
    persist();
    return copyJob(job);
}

export function updateProgress(jobId: string, progressPercent?: number): PDFJob | null {
    hydrate();

    const existing = inMemoryJobs.get(jobId);
    if (!existing) return null;

    const nextProgress =
        typeof progressPercent === 'number'
            ? clampProgress(progressPercent)
            : clampProgress(existing.progress + 1);

    const updated: PDFJob = {
        ...existing,
        status: 'processing',
        progress: Math.min(nextProgress, 99),
        updatedAt: nextTimestamp(),
    };

    inMemoryJobs.set(jobId, updated);
    persist();
    return copyJob(updated);
}

export function setJobSourceText(jobId: string, sourceText: string): PDFJob | null {
    hydrate();

    const existing = inMemoryJobs.get(jobId);
    if (!existing) return null;

    const reset: PDFJob = {
        ...existing,
        status: 'processing',
        progress: Math.max(1, existing.progress),
        sourceText,
        partialResult: null,
        processedChunks: 0,
        totalChunks: 0,
        result: null,
        updatedAt: nextTimestamp(),
    };

    inMemoryJobs.set(jobId, reset);
    persist();
    return copyJob(reset);
}

export function savePartialCompletion(
    jobId: string,
    partialResult: string,
    processedChunks: number,
    totalChunks: number,
    progressPercent: number,
): PDFJob | null {
    hydrate();

    const existing = inMemoryJobs.get(jobId);
    if (!existing) return null;

    const updated: PDFJob = {
        ...existing,
        status: 'processing',
        progress: Math.min(clampProgress(progressPercent), 99),
        partialResult,
        result: partialResult,
        processedChunks: Math.max(0, processedChunks),
        totalChunks: Math.max(0, totalChunks),
        updatedAt: nextTimestamp(),
    };

    inMemoryJobs.set(jobId, updated);
    persist();
    return copyJob(updated);
}

export function completeJob(jobId: string, result?: string): PDFJob | null {
    hydrate();

    const existing = inMemoryJobs.get(jobId);
    if (!existing) return null;

    const completed: PDFJob = {
        ...existing,
        status: 'complete',
        progress: 100,
        result: result ?? existing.result ?? existing.partialResult ?? null,
        partialResult: null,
        sourceText: null,
        processedChunks:
            typeof existing.totalChunks === 'number'
                ? existing.totalChunks
                : existing.processedChunks,
        updatedAt: nextTimestamp(),
    };

    inMemoryJobs.set(jobId, completed);
    persist();
    return copyJob(completed);
}

export function getJob(jobId: string): PDFJob | null {
    hydrate();
    const job = inMemoryJobs.get(jobId);
    return job ? copyJob(job) : null;
}

export function listJobs(): PDFJob[] {
    hydrate();
    return [...inMemoryJobs.values()].sort((a, b) => b.updatedAt - a.updatedAt).map(copyJob);
}

export function clearJobs(): void {
    inMemoryJobs.clear();
    hydrated = false;
    lastTimestamp = 0;

    const storage = getLocalStorage();
    if (!storage) return;
    try {
        storage.removeItem(STORAGE_KEY);
    } catch {
        // Ignore localStorage availability errors.
    }
}
