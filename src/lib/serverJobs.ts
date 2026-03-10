/**
 * serverJobs.ts — Frontend client for the server-side job API
 */

const jobAccessTokens = new Map<string, string>();

function getConfiguredApiBase(): string | undefined {
    const viteValue = import.meta.env.VITE_API_PROXY_URL as string | undefined;
    const maybeProcess = globalThis as unknown as {
        process?: { env?: Record<string, string | undefined> };
    };
    return viteValue || maybeProcess.process?.env?.VITE_API_PROXY_URL;
}

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
    const apiBase = getConfiguredApiBase();
    if (!apiBase) throw new Error('Server API not configured (VITE_API_PROXY_URL not set)');
    return apiBase;
}

function getTokenHeaders(bookId: string): HeadersInit {
    const token = jobAccessTokens.get(bookId);
    return token ? { 'X-Job-Token': token } : {};
}

/** Check if server-side job processing is available */
export function isServerProcessingAvailable(): boolean {
    return Boolean(getConfiguredApiBase());
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

    const data = (await res.json()) as {
        bookId: string;
        status: string;
        totalChapters: number;
        accessToken?: string;
    };

    if (data.accessToken && data.bookId) {
        jobAccessTokens.set(data.bookId, data.accessToken);
    }

    return {
        bookId: data.bookId,
        status: data.status,
        totalChapters: data.totalChapters,
    };
}

// ─── Job Status ─────────────────────────────────────────────

export async function getJobStatus(bookId: string): Promise<ServerJobState> {
    const res = await fetch(`${getBaseUrl()}/api/jobs/${bookId}`, {
        headers: getTokenHeaders(bookId),
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
        headers: getTokenHeaders(bookId),
        signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
        throw new Error(`Chapter not available: ${res.status}`);
    }

    return res.json();
}

// ─── SSE Event Stream ───────────────────────────────────────

export function connectToJobEvents(
    bookId: string,
    onProgress: (event: ServerJobEvent) => void,
    onComplete: (event: ServerJobEvent) => void,
    onError: (error: string) => void,
): () => void {
    let closed = false;
    let settled = false;
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
        const token = jobAccessTokens.get(bookId);
        const params = token ? `?token=${encodeURIComponent(token)}` : '';
        const url = `${getBaseUrl()}/api/jobs/${bookId}/events${params}`;
        eventSource = new EventSource(url);

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

        eventSource.onerror = () => {
            if (closed) return;
            console.warn('[ServerJobs] SSE disconnected, falling back to polling');
            if (eventSource) {
                const es = eventSource;
                eventSource = null;
                es.close();
            }
            startPolling();
        };
    } catch {
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
                    if (!settled) {
                        settled = true;
                        onComplete({ type: 'job_completed', bookId, timestamp: Date.now() });
                    }
                    cleanup();
                } else if (status.status === 'failed' || status.status === 'cancelled') {
                    if (!settled) {
                        settled = true;
                        onError(status.errorMessage || `Job ${status.status}`);
                    }
                    cleanup();
                }
            } catch (err) {
                if (!settled) {
                    settled = true;
                    onError((err as Error).message || 'Polling failed');
                }
                cleanup();
            } finally {
                pollInFlight = false;
            }
        }, 2000);
    }

    return cleanup;
}
