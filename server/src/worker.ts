/**
 * worker.ts — RabbitMQ consumer for cinematification jobs
 *
 * Connects to Redis + RabbitMQ, consumes `cinematify-jobs` queue.
 * Per message:
 *   1. Check if job is cancelled
 *   2. Update job status → processing
 *   3. Publish chapter_started event
 *   4. Check Redis cache
 *   5. Chunk text, call AI provider per chunk, accumulate blocks
 *   6. On failure → fallback to cinematifyOffline()
 *   7. Store result, increment progress, publish events
 *   8. If all chapters done → publish job_completed
 */

import { getClient as getRedis } from './services/redis.js';
import { disconnect as disconnectRedis } from './services/redis.js';
import {
    connect as connectRabbitMQ,
    consumeJobs,
    disconnect as disconnectRabbitMQ,
    QUEUES,
} from './services/rabbitmq.js';
import { getCachedResponse, setCachedResponse } from './services/cache.js';
import { callAIProvider } from './services/aiProvider.js';
import {
    getJob,
    updateJobStatus,
    updateChapterStatus,
    incrementProcessedChapters,
    storeChapterResult,
    publishJobEvent,
} from './services/jobManager.js';
import {
    chunkText,
    CINEMATIFICATION_SYSTEM_PROMPT,
    parseCinematifiedText,
    cinematifyOffline,
} from './lib/cinematifier.js';
import type { CinematifyJobMessage, CinematicBlock, ChapterResult } from './types.js';

let isShuttingDown = false;

// ── Main worker logic ───────────────────────────────────────

async function processChapter(
    msg: import('amqplib').ConsumeMessage,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _channel: import('amqplib').Channel,
): Promise<void> {
    let job: CinematifyJobMessage;
    try {
        job = JSON.parse(msg.content.toString());
    } catch {
        console.error('[Worker] Failed to parse job message, discarding');
        // Return without throwing — consumeJobs() wrapper will ack
        return;
    }
    const { bookId, chapterIndex, chapterTitle, originalText, provider } = job;

    console.log(
        `[Worker] Processing ${bookId} chapter ${chapterIndex + 1}/${job.totalChapters}: ${chapterTitle}`,
    );

    // 1. Check if job is cancelled
    const jobState = await getJob(bookId);
    if (!jobState || jobState.status === 'cancelled') {
        console.log(`[Worker] Job ${bookId} cancelled, skipping chapter ${chapterIndex}`);
        // Return without throwing — consumeJobs() wrapper will ack
        return;
    }

    // 2. Update job status to processing
    if (jobState.status === 'queued') {
        await updateJobStatus(bookId, 'processing');
    }

    // 3. Publish chapter_started event
    await updateChapterStatus(bookId, chapterIndex);
    await publishJobEvent(bookId, {
        type: 'chapter_started',
        bookId,
        chapterIndex,
        totalChapters: job.totalChapters,
        timestamp: Date.now(),
    });

    let result: ChapterResult;

    try {
        // 4. Process via AI or cache
        const startTime = performance.now();
        const chunks = chunkText(originalText);
        const allBlocks: CinematicBlock[] = [];
        const allRawText: string[] = [];
        let sfxCount = 0;
        let transitionCount = 0;
        let beatCount = 0;
        let previousSummary = '';

        for (let i = 0; i < chunks.length; i++) {
            // Check cancellation between chunks
            if (isShuttingDown) throw new Error('Worker shutting down');
            const currentState = await getJob(bookId);
            if (currentState?.status === 'cancelled') {
                console.log(`[Worker] Job ${bookId} cancelled mid-processing`);
                // Return without throwing — consumeJobs() wrapper will ack
                return;
            }

            let prompt = CINEMATIFICATION_SYSTEM_PROMPT;
            if (previousSummary) {
                prompt += `\n\nPREVIOUS CHUNK CONTEXT:\n"""\n${previousSummary}\n"""\n`;
            }
            prompt += `\n\nORIGINAL CHAPTER TEXT:\n"""\n${chunks[i]}\n"""\n\nOUTPUT: Full cinematified version`;

            // Check cache
            let raw: string | null = await getCachedResponse(provider, prompt);
            const cacheHit = raw !== null;

            if (!raw) {
                raw = await callAIProvider(prompt, provider);
                // Store in cache for future hits
                await setCachedResponse(provider, prompt, raw);
            }

            if (cacheHit) {
                console.log(`[Worker] Cache hit for ${bookId} ch${chapterIndex} chunk${i}`);
            }

            allRawText.push(raw);
            const blocks = parseCinematifiedText(raw);
            allBlocks.push(...blocks);

            for (const block of blocks) {
                if (block.sfx) sfxCount++;
                if (block.transition) transitionCount++;
                if (block.beat) beatCount++;
            }

            // Extract summary for next chunk
            const summaryMatch = raw.match(/\[SUMMARY:\s*([^\]]+)\]/i);
            if (summaryMatch) {
                previousSummary = summaryMatch[1].trim();
            }
        }

        const processingTimeMs = Math.round(performance.now() - startTime);

        result = {
            blocks: allBlocks,
            rawText: allRawText.join('\n\n'),
            metadata: {
                originalWordCount: originalText.split(/\s+/).length,
                cinematifiedWordCount: allBlocks.reduce(
                    (acc, b) => acc + (b.content?.split(/\s+/).length || 0),
                    0,
                ),
                sfxCount,
                transitionCount,
                beatCount,
                processingTimeMs,
            },
        };
    } catch (err) {
        console.warn(
            `[Worker] AI processing failed for ${bookId} ch${chapterIndex}, using offline fallback:`,
            (err as Error).message,
        );
        // Fallback to offline processing
        result = cinematifyOffline(originalText);
    }

    // 7. Store result and update progress
    // Wrap in try-catch so Redis errors don't nack the message (AI work is done)
    try {
        await storeChapterResult(bookId, chapterIndex, result);

        // 8. Increment and check completion (atomic — only the worker that increments to total fires completion)
        const processedCount = await incrementProcessedChapters(bookId);
        const job_ = await getJob(bookId);
        const totalFromState = job_?.totalChapters ?? job.totalChapters;

        await publishJobEvent(bookId, {
            type: 'chapter_completed',
            bookId,
            chapterIndex,
            processedChapters: processedCount,
            totalChapters: job.totalChapters,
            timestamp: Date.now(),
        });

        console.log(
            `[Worker] Completed ${bookId} ch${chapterIndex} (${processedCount}/${job.totalChapters})`,
        );

        // 9. If all chapters done, publish job_completed (only the last worker to increment does this)
        if (processedCount >= totalFromState) {
            await updateJobStatus(bookId, 'completed');
            await publishJobEvent(bookId, {
                type: 'job_completed',
                bookId,
                processedChapters: processedCount,
                totalChapters: job.totalChapters,
                timestamp: Date.now(),
            });
            console.log(`[Worker] Job ${bookId} completed!`);
        }
    } catch (storeErr) {
        // Non-fatal: AI work succeeded but Redis storage failed.
        // Message will still be acked to prevent re-processing expensive AI calls.
        console.error(
            `[Worker] Failed to store result for ${bookId} ch${chapterIndex}:`,
            (storeErr as Error).message,
        );
    }
}

// ── Startup ─────────────────────────────────────────────────

async function start(): Promise<void> {
    console.log('[Worker] Starting...');

    // Connect Redis
    try {
        await getRedis();
        console.log('[Worker] Redis connected');
    } catch (err) {
        console.error('[Worker] Redis connection failed:', (err as Error).message);
        process.exit(1);
    }

    // Connect RabbitMQ
    try {
        await connectRabbitMQ();
        console.log('[Worker] RabbitMQ connected');
    } catch (err) {
        console.error('[Worker] RabbitMQ connection failed:', (err as Error).message);
        process.exit(1);
    }

    // Start consuming
    await consumeJobs(QUEUES.CINEMATIFY_JOBS, processChapter);
    console.log('[Worker] Consuming cinematify-jobs queue');
}

// ── Graceful Shutdown ───────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
    console.log(`\n[Worker] ${signal} received, shutting down...`);
    isShuttingDown = true;

    const timeout = setTimeout(() => {
        console.error('[Worker] Shutdown timeout, forcing exit');
        process.exit(1);
    }, 30_000);

    try {
        await Promise.all([disconnectRedis(), disconnectRabbitMQ()]);
    } catch (err) {
        console.error('[Worker] Error during shutdown:', (err as Error).message);
    }

    clearTimeout(timeout);
    process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

void start().catch(err => {
    console.error('[Worker] Fatal startup error:', (err as Error).message);
    process.exit(1);
});
