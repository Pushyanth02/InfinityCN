/**
 * serverJobs.ts — Frontend client for the server-side job API
 *
 * Provides functions to submit books for server processing,
 * poll job status, fetch chapter results, and stream SSE events.
 */

const API_BASE = import.meta.env.VITE_API_PROXY_URL as string | undefined;

// ─── Types ──────────────────────────────────────────────────

export interface ServerJobState {
    bookId: string;
    title: string;
    status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
    provider: string;
    totalChapters: number;
    processedChapters: number;
    currentChapter: number;
    errorMessage: string;
    createdAt: number;
    updatedAt: number;
}

export interface ServerChapterResult {
    blocks: Array<{
        id: string;
        type: string;
        content: string;
        speaker?: string;
        sfx?: { sound: string; intensity: string };
        beat?: { type: string };
        transition?: { type: string; description?: string };
        intensity: string;
        cameraDirection?: string;
        timing?: string;
        emotion?: string;
        tensionScore?: number;
    }>;
    rawText: string;
    metadata: {
        originalWordCount: number;
        cinematifiedWordCount: number;
        sfxCount: number;
        transitionCount: number;
        beatCount: number;
        processingTimeMs: number;
    };
}

export interface ServerJobEvent {
    type: string;
    bookId: string;
    chapterIndex?: number;
    totalChapters?: number;
    processedChapters?: number;
    errorMessage?: string;
    timestamp: number;
}

// ─── API Helpers ────────────────────────────────────────────

function getBaseUrl(): string {
    if (!API_BASE) throw new Error('Server API not configured (VITE_API_PROXY_URL not set)');
    return API_BASE;
}

/** Check if server-side job processing is available */
export function isServerProcessingAvailable(): boolean {
    return Boolean(API_BASE);
}

// ─── Submit Job ─────────────────────────────────────────────

export async function submitBookForServerProcessing(
    bookId: string,
    title: string,
    chapters: Array<{ title: string; originalText: string }>,
    provider: string,
): Promise<{ bookId: string; status: string; totalChapters: number }> {
    const res = await fetch(`${getBaseUrl()}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, title, chapters, provider }),
        signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || `Server error: ${res.status}`);
    }

    return res.json();
}

// ─── Job Status ─────────────────────────────────────────────

export async function getJobStatus(bookId: string): Promise<ServerJobState> {
    const res = await fetch(`${getBaseUrl()}/api/jobs/${bookId}`, {
        signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
        throw new Error(`Failed to get job status: ${res.status}`);
    }

    return res.json();
}

// ─── Chapter Result ─────────────────────────────────────────

export async function getProcessedChapter(
    bookId: string,
    chapterIndex: number,
): Promise<ServerChapterResult> {
    const res = await fetch(`${getBaseUrl()}/api/jobs/${bookId}/chapters/${chapterIndex}`, {
        signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
        throw new Error(`Chapter not available: ${res.status}`);
    }

    return res.json();
}

// ─── SSE Event Stream ───────────────────────────────────────

/**
 * Connect to the server's SSE endpoint for real-time job events.
 * Falls back to polling if EventSource fails.
 *
 * @returns Cleanup function to close the connection
 */
export function connectToJobEvents(
    bookId: string,
    onProgress: (event: ServerJobEvent) => void,
    onComplete: (event: ServerJobEvent) => void,
    onError: (error: string) => void,
): () => void {
    let closed = false;
    let settled = false; // Prevents onComplete/onError from firing twice
    let eventSource: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let pollInFlight = false;

    const cleanup = () => {
        closed = true;
        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    };

    try {
        const url = `${getBaseUrl()}/api/jobs/${bookId}/events`;
        eventSource = new EventSource(url);

        // Handle specific event types
        eventSource.addEventListener('status', (e: MessageEvent) => {
            if (closed) return;
            try {
                onProgress(JSON.parse(e.data));
            } catch {
                /* ignore */
            }
        });

        eventSource.addEventListener('chapter_started', (e: MessageEvent) => {
            if (closed) return;
            try {
                onProgress(JSON.parse(e.data));
            } catch {
                /* ignore */
            }
        });

        eventSource.addEventListener('chapter_completed', (e: MessageEvent) => {
            if (closed) return;
            try {
                onProgress(JSON.parse(e.data));
            } catch {
                /* ignore */
            }
        });

        eventSource.addEventListener('job_completed', (e: MessageEvent) => {
            if (closed || settled) return;
            settled = true;
            try {
                onComplete(JSON.parse(e.data));
            } catch {
                /* ignore */
            }
            cleanup();
        });

        eventSource.addEventListener('job_failed', (e: MessageEvent) => {
            if (closed || settled) return;
            settled = true;
            try {
                const data = JSON.parse(e.data);
                onError(data.errorMessage || 'Job failed');
            } catch {
                onError('Job failed');
            }
            cleanup();
        });

        eventSource.addEventListener('job_cancelled', () => {
            if (closed || settled) return;
            settled = true;
            onError('Job was cancelled');
            cleanup();
        });

        eventSource.addEventListener('error', (e: MessageEvent) => {
            if (closed) return;
            try {
                const data = JSON.parse(e.data);
                onError(data.error || 'SSE error');
            } catch {
                /* ignore */
            }
        });

        // If EventSource itself errors, close it fully and fall back to polling
        eventSource.onerror = () => {
            if (closed) return;
            console.warn('[ServerJobs] SSE disconnected, falling back to polling');
            // Fully close and nullify EventSource to prevent auto-reconnect
            if (eventSource) {
                const es = eventSource;
                eventSource = null;
                es.close();
            }
            startPolling();
        };
    } catch {
        // EventSource not available or URL invalid — poll instead
        startPolling();
    }

    function startPolling() {
        if (closed || pollTimer) return;

        pollTimer = setInterval(async () => {
            if (closed || pollInFlight) return;
            pollInFlight = true;

            try {
                const status = await getJobStatus(bookId);
                onProgress({
                    type: 'status',
                    bookId: status.bookId,
                    processedChapters: status.processedChapters,
                    totalChapters: status.totalChapters,
                    timestamp: Date.now(),
                });

                if (status.status === 'completed') {
                    if (settled) {
                        cleanup();
                        return;
                    }
                    settled = true;
                    onComplete({
                        type: 'job_completed',
                        bookId: status.bookId,
                        processedChapters: status.processedChapters,
                        totalChapters: status.totalChapters,
                        timestamp: Date.now(),
                    });
                    cleanup();
                } else if (status.status === 'failed') {
                    if (settled) {
                        cleanup();
                        return;
                    }
                    settled = true;
                    onError(status.errorMessage || 'Job failed');
                    cleanup();
                } else if (status.status === 'cancelled') {
                    if (settled) {
                        cleanup();
                        return;
                    }
                    settled = true;
                    onError('Job was cancelled');
                    cleanup();
                }
            } catch (err) {
                console.warn('[ServerJobs] Poll failed:', err);
            } finally {
                pollInFlight = false;
            }
        }, 5_000);
    }

    return cleanup;
}
