/**
 * routes/jobs.ts — Job submission, status, and SSE event endpoints
 *
 * Endpoints:
 *   POST   /api/jobs                    — Submit a book for server-side cinematification
 *   GET    /api/jobs/:bookId            — Get job status
 *   GET    /api/jobs/:bookId/chapters/:index — Get processed chapter result
 *   DELETE /api/jobs/:bookId            — Cancel a job
 *   GET    /api/jobs/:bookId/events     — SSE stream for real-time progress
 */

import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { publishJob, isHealthy as isRabbitHealthy, QUEUES } from '../services/rabbitmq.js';
import {
    createJob,
    getJob,
    cancelJob,
    getChapterResult,
    getEventsChannel,
} from '../services/jobManager.js';
import { getSubscriber } from '../services/redis.js';
import type { CinematifyJobMessage, SubmitJobRequest } from '../types.js';

const router = Router();

const MAX_CHAPTERS = 500;
const MAX_CHAPTER_TEXT_BYTES = 500_000; // 500KB per chapter
const MAX_TOTAL_PAYLOAD_BYTES = 50_000_000; // 50MB total
const MAX_TITLE_LENGTH = 500;
const VALID_PROVIDERS = new Set(['gemini', 'openai', 'anthropic', 'groq', 'deepseek', 'ollama']);
const BOOK_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

// ── POST /api/jobs — Submit a cinematification job ──────────

router.post('/api/jobs', async (req: Request, res: Response) => {
    const rabbitOk = await isRabbitHealthy();
    if (!rabbitOk) {
        res.status(503).json({ error: 'Job queue unavailable. RabbitMQ is not connected.' });
        return;
    }

    const body = req.body as SubmitJobRequest;

    if (!body.chapters || !Array.isArray(body.chapters) || body.chapters.length === 0) {
        res.status(400).json({ error: 'Request must include a non-empty chapters array.' });
        return;
    }
    if (body.chapters.length > MAX_CHAPTERS) {
        res.status(400).json({ error: `Too many chapters (max ${MAX_CHAPTERS}).` });
        return;
    }
    if (!body.provider || body.provider === 'none' || body.provider === 'chrome') {
        res.status(400).json({ error: 'A valid server-side AI provider is required.' });
        return;
    }
    if (!VALID_PROVIDERS.has(body.provider)) {
        res.status(400).json({ error: `Unknown AI provider "${body.provider}".` });
        return;
    }
    if (!body.title || typeof body.title !== 'string') {
        res.status(400).json({ error: 'Book title is required.' });
        return;
    }
    if (body.title.length > MAX_TITLE_LENGTH) {
        res.status(400).json({ error: `Title too long (max ${MAX_TITLE_LENGTH} characters).` });
        return;
    }
    if (body.bookId && !BOOK_ID_RE.test(body.bookId)) {
        res.status(400).json({
            error: 'Invalid bookId. Use alphanumeric characters, hyphens, and underscores only (max 128).',
        });
        return;
    }

    // Validate chapter sizes
    let totalSize = 0;
    for (let i = 0; i < body.chapters.length; i++) {
        const ch = body.chapters[i];
        if (!ch.originalText || typeof ch.originalText !== 'string') {
            res.status(400).json({ error: `Chapter ${i} is missing originalText.` });
            return;
        }
        const chSize = Buffer.byteLength(ch.originalText, 'utf8');
        if (chSize > MAX_CHAPTER_TEXT_BYTES) {
            res.status(400).json({
                error: `Chapter ${i} exceeds max size (${Math.round(MAX_CHAPTER_TEXT_BYTES / 1024)}KB).`,
            });
            return;
        }
        totalSize += chSize;
    }
    if (totalSize > MAX_TOTAL_PAYLOAD_BYTES) {
        res.status(400).json({
            error: `Total payload exceeds max size (${Math.round(MAX_TOTAL_PAYLOAD_BYTES / 1_000_000)}MB).`,
        });
        return;
    }

    const bookId = body.bookId || `book-${Date.now()}`;
    const totalChapters = body.chapters.length;
    const correlationId = uuidv4();

    // Create job state in Redis
    await createJob(bookId, body.title, totalChapters, body.provider);

    // Publish one message per chapter to the cinematify-jobs queue
    for (let i = 0; i < totalChapters; i++) {
        const chapter = body.chapters[i];
        const message: CinematifyJobMessage = {
            bookId,
            chapterIndex: i,
            chapterTitle: chapter.title,
            originalText: chapter.originalText,
            provider: body.provider,
            totalChapters,
            attempt: 1,
            maxAttempts: 3,
            correlationId,
        };
        await publishJob(QUEUES.CINEMATIFY_JOBS, message);
    }

    res.status(201).json({
        bookId,
        status: 'queued',
        totalChapters,
    });
});

// ── Param validation helper ─────────────────────────────────

function isValidBookId(bookId: string): boolean {
    return BOOK_ID_RE.test(bookId);
}

// ── GET /api/jobs/:bookId — Get job status ──────────────────

router.get('/api/jobs/:bookId', async (req: Request<{ bookId: string }>, res: Response) => {
    const { bookId } = req.params;
    if (!isValidBookId(bookId)) {
        res.status(400).json({ error: 'Invalid bookId.' });
        return;
    }
    const job = await getJob(bookId);

    if (!job) {
        res.status(404).json({ error: 'Job not found.' });
        return;
    }

    res.json(job);
});

// ── GET /api/jobs/:bookId/chapters/:index — Get chapter result

router.get(
    '/api/jobs/:bookId/chapters/:index',
    async (req: Request<{ bookId: string; index: string }>, res: Response) => {
        const { bookId, index } = req.params;
        if (!isValidBookId(bookId)) {
            res.status(400).json({ error: 'Invalid bookId.' });
            return;
        }
        const chapterIndex = parseInt(index, 10);

        if (isNaN(chapterIndex) || chapterIndex < 0) {
            res.status(400).json({ error: 'Invalid chapter index.' });
            return;
        }

        // Validate chapter bounds against job
        const job = await getJob(bookId);
        if (!job) {
            res.status(404).json({ error: 'Job not found.' });
            return;
        }
        if (chapterIndex >= job.totalChapters) {
            res.status(400).json({
                error: `Chapter index ${chapterIndex} out of range (0-${job.totalChapters - 1}).`,
            });
            return;
        }

        const result = await getChapterResult(bookId, chapterIndex);
        if (!result) {
            res.status(404).json({ error: 'Chapter result not available yet.' });
            return;
        }

        res.json(result);
    },
);

// ── DELETE /api/jobs/:bookId — Cancel a job ─────────────────

router.delete('/api/jobs/:bookId', async (req: Request<{ bookId: string }>, res: Response) => {
    const { bookId } = req.params;
    if (!isValidBookId(bookId)) {
        res.status(400).json({ error: 'Invalid bookId.' });
        return;
    }
    const cancelled = await cancelJob(bookId);

    if (!cancelled) {
        res.status(404).json({ error: 'Job not found.' });
        return;
    }

    res.json({ bookId, status: 'cancelled' });
});

// ── GET /api/jobs/:bookId/events — SSE stream ──────────────

router.get('/api/jobs/:bookId/events', async (req: Request<{ bookId: string }>, res: Response) => {
    const { bookId } = req.params;
    if (!isValidBookId(bookId)) {
        res.status(400).json({ error: 'Invalid bookId.' });
        return;
    }

    // Verify job exists
    const job = await getJob(bookId);
    if (!job) {
        res.status(404).json({ error: 'Job not found.' });
        return;
    }

    // Set SSE headers
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
    });
    res.flushHeaders();

    // Send initial job state
    res.write(`event: status\ndata: ${JSON.stringify(job)}\n\n`);

    // If job is already terminal, send final event and close
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
        res.write(
            `event: ${job.status === 'completed' ? 'job_completed' : job.status === 'failed' ? 'job_failed' : 'job_cancelled'}\ndata: ${JSON.stringify({ bookId, status: job.status })}\n\n`,
        );
        res.end();
        return;
    }

    // Subscribe to Redis Pub/Sub channel for this job
    let subscriber: Awaited<ReturnType<typeof getSubscriber>> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (subscriber) {
            const channel = getEventsChannel(bookId);
            subscriber.unsubscribe(channel).catch(() => {});
        }
    };

    try {
        subscriber = await getSubscriber();
        const channel = getEventsChannel(bookId);

        subscriber.on('message', (ch: string, message: string) => {
            if (ch !== channel || closed) return;

            try {
                const event = JSON.parse(message);
                const eventType = event.type || 'progress';
                res.write(`event: ${eventType}\ndata: ${message}\n\n`);

                // Close the stream on terminal events
                if (
                    eventType === 'job_completed' ||
                    eventType === 'job_failed' ||
                    eventType === 'job_cancelled'
                ) {
                    cleanup();
                    res.end();
                }
            } catch {
                // Ignore malformed messages
            }
        });

        await subscriber.subscribe(channel);

        // Heartbeat to keep connection alive
        heartbeatTimer = setInterval(() => {
            if (closed) return;
            res.write(':keepalive\n\n');
        }, 15_000);

        // Client disconnect cleanup
        req.on('close', cleanup);
    } catch {
        // If Redis subscriber fails, just close the SSE connection
        res.write(
            `event: error\ndata: ${JSON.stringify({ error: 'Failed to subscribe to events' })}\n\n`,
        );
        res.end();
    }
});

export default router;
