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
