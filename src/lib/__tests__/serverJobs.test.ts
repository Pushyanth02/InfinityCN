import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    isServerProcessingAvailable,
    submitBookForServerProcessing,
    getJobStatus,
    getProcessedChapter,
    connectToJobEvents,
} from '../serverJobs';

function makeJsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

const SAMPLE_CHAPTERS = [
    { title: 'Chapter 1', originalText: 'The story begins here.' },
    { title: 'Chapter 2', originalText: 'The adventure continues.' },
];

describe('serverJobs', () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('isServerProcessingAvailable reflects VITE_API_PROXY_URL', () => {
        vi.stubEnv('VITE_API_PROXY_URL', 'http://server');
        expect(isServerProcessingAvailable()).toBe(true);

        vi.unstubAllEnvs();
        expect(isServerProcessingAvailable()).toBe(false);
    });

    it('submitBookForServerProcessing stores token and uses it on status/chapter requests', async () => {
        vi.stubEnv('VITE_API_PROXY_URL', 'http://server');

        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                makeJsonResponse({
                    bookId: 'book-1',
                    status: 'queued',
                    totalChapters: 2,
                    accessToken: 'token-123',
                }),
            )
            .mockResolvedValueOnce(
                makeJsonResponse({
                    bookId: 'book-1',
                    title: 'My Novel',
                    status: 'processing',
                    provider: 'openai',
                    totalChapters: 2,
                    processedChapters: 1,
                    currentChapter: 1,
                    errorMessage: '',
                    createdAt: 1,
                    updatedAt: 2,
                }),
            )
            .mockResolvedValueOnce(
                makeJsonResponse({
                    blocks: [{ id: '1', type: 'action', content: 'Text', intensity: 'normal' }],
                    rawText: 'Text',
                    metadata: {
                        originalWordCount: 1,
                        cinematifiedWordCount: 1,
                        sfxCount: 0,
                        transitionCount: 0,
                        beatCount: 0,
                        processingTimeMs: 10,
                    },
                }),
            );
        vi.stubGlobal('fetch', fetchMock);

        await submitBookForServerProcessing('book-1', 'My Novel', SAMPLE_CHAPTERS, 'openai');
        await getJobStatus('book-1');
        await getProcessedChapter('book-1', 0);

        const statusCall = fetchMock.mock.calls[1];
        const chapterCall = fetchMock.mock.calls[2];

        expect((statusCall[1] as RequestInit).headers).toEqual({ 'X-Job-Token': 'token-123' });
        expect((chapterCall[1] as RequestInit).headers).toEqual({ 'X-Job-Token': 'token-123' });
    });

    it('connectToJobEvents appends token to SSE URL when available', async () => {
        vi.stubEnv('VITE_API_PROXY_URL', 'http://server');

        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                makeJsonResponse({
                    bookId: 'book-1',
                    status: 'queued',
                    totalChapters: 1,
                    accessToken: 'token-xyz',
                }),
            ),
        );

        const eventSourceCtor = vi.fn().mockImplementation(function (this: {
            close: () => void;
            addEventListener: () => void;
            onerror: (() => void) | null;
        }) {
            this.close = vi.fn();
            this.addEventListener = vi.fn();
            this.onerror = null;
            return this;
        });
        vi.stubGlobal('EventSource', eventSourceCtor as unknown as typeof EventSource);

        await submitBookForServerProcessing('book-1', 'My Novel', SAMPLE_CHAPTERS, 'openai');

        connectToJobEvents('book-1', vi.fn(), vi.fn(), vi.fn());

        expect(eventSourceCtor.mock.calls[0][0]).toContain(
            '/api/jobs/book-1/events?token=token-xyz',
        );
    });

    it('keeps job token available during async onComplete handler', async () => {
        vi.stubEnv('VITE_API_PROXY_URL', 'http://server');

        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                makeJsonResponse({
                    bookId: 'book-2',
                    status: 'queued',
                    totalChapters: 1,
                    accessToken: 'token-abc',
                }),
            )
            .mockResolvedValueOnce(
                makeJsonResponse({
                    blocks: [],
                    rawText: '',
                    metadata: {
                        originalWordCount: 0,
                        cinematifiedWordCount: 0,
                        sfxCount: 0,
                        transitionCount: 0,
                        beatCount: 0,
                        processingTimeMs: 0,
                    },
                }),
            );
        vi.stubGlobal('fetch', fetchMock);

        // Capture addEventListener calls to simulate SSE events
        const listeners: Record<string, (e: MessageEvent) => void> = {};
        const eventSourceCtor = vi.fn().mockImplementation(function (this: {
            close: () => void;
            addEventListener: (type: string, cb: (e: MessageEvent) => void) => void;
            onerror: (() => void) | null;
        }) {
            this.close = vi.fn();
            this.addEventListener = vi.fn((type: string, cb: (e: MessageEvent) => void) => {
                listeners[type] = cb;
            });
            this.onerror = null;
            return this;
        });
        vi.stubGlobal('EventSource', eventSourceCtor as unknown as typeof EventSource);

        await submitBookForServerProcessing('book-2', 'Test', SAMPLE_CHAPTERS, 'openai');

        let tokenDuringComplete: string | undefined;
        let completeResolve: () => void;
        const completePromise = new Promise<void>(r => {
            completeResolve = r;
        });

        const onComplete = async () => {
            // Simulate async chapter fetch inside onComplete
            await getProcessedChapter('book-2', 0);
            // Check the fetch was called with the token header
            const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
            tokenDuringComplete = (lastCall[1] as RequestInit).headers
                ? ((lastCall[1] as RequestInit).headers as Record<string, string>)['X-Job-Token']
                : undefined;
            completeResolve();
        };

        connectToJobEvents('book-2', vi.fn(), onComplete, vi.fn());

        // Fire the job_completed SSE event
        listeners['job_completed'](
            new MessageEvent('job_completed', {
                data: JSON.stringify({ type: 'job_completed', bookId: 'book-2', timestamp: 1 }),
            }),
        );

        // Wait for the async onComplete to finish
        await completePromise;

        // Token should have been present during the async fetch
        expect(tokenDuringComplete).toBe('token-abc');
    });

    it('falls back to polling at a rate that stays under server rate limits', async () => {
        vi.stubEnv('VITE_API_PROXY_URL', 'http://server');

        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                makeJsonResponse({
                    bookId: 'book-1',
                    status: 'queued',
                    totalChapters: 1,
                    accessToken: 'token-xyz',
                }),
            ),
        );

        const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
        vi.stubGlobal(
            'EventSource',
            vi.fn().mockImplementation(function () {
                throw new Error('SSE unavailable');
            }) as unknown as typeof EventSource,
        );

        await submitBookForServerProcessing('book-1', 'My Novel', SAMPLE_CHAPTERS, 'openai');

        const cleanup = connectToJobEvents('book-1', vi.fn(), vi.fn(), vi.fn());

        expect(setIntervalSpy).toHaveBeenCalled();
        expect(setIntervalSpy.mock.calls[0][1]).toBe(4000);

        cleanup();
        setIntervalSpy.mockRestore();
    });
    it('throws on non-OK API responses', async () => {
        vi.stubEnv('VITE_API_PROXY_URL', 'http://server');

        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(makeJsonResponse({ error: 'Internal server error' }, 500)),
        );

        await expect(
            submitBookForServerProcessing('book-1', 'My Novel', SAMPLE_CHAPTERS, 'openai'),
        ).rejects.toThrow('Internal server error');
        await expect(getJobStatus('book-1')).rejects.toThrow();
        await expect(getProcessedChapter('book-1', 0)).rejects.toThrow();
    });
});
