/**
 * jobManager.ts — Job state management via Redis hashes
 *
 * Manages cinematification job lifecycle:
 *   - Create/get/update/cancel jobs
 *   - Per-chapter result storage with TTL
 *   - Progress tracking and event publishing via Redis Pub/Sub
 */

import { getClient as getRedis } from './redis.js';
import { config } from '../config.js';
import type { JobState, JobStatus, JobEvent, ChapterResult } from '../types.js';

const KEY_PREFIX = config.redisKeyPrefix;
const JOB_KEY = (bookId: string) => `${KEY_PREFIX}job:${bookId}`;
const CHAPTER_KEY = (bookId: string, index: number) => `${KEY_PREFIX}job:${bookId}:ch:${index}`;
const EVENTS_CHANNEL = (bookId: string) => `${KEY_PREFIX}events:${bookId}`;
const CHAPTER_RESULT_TTL = 86_400; // 24 hours

// ─── Create Job ─────────────────────────────────────────────

export async function createJob(
    bookId: string,
    title: string,
    totalChapters: number,
    provider: string,
): Promise<JobState> {
    const redis = await getRedis();
    const now = Date.now();

    const state: JobState = {
        bookId,
        title,
        status: 'queued',
        provider,
        totalChapters,
        processedChapters: 0,
        currentChapter: 0,
        errorMessage: '',
        createdAt: now,
        updatedAt: now,
    };

    await redis.hset(JOB_KEY(bookId), serializeJobState(state));

    // Expire job state after 48 hours
    await redis.expire(JOB_KEY(bookId), 172_800);

    return state;
}

// ─── Get Job ────────────────────────────────────────────────

export async function getJob(bookId: string): Promise<JobState | null> {
    const redis = await getRedis();
    const data = await redis.hgetall(JOB_KEY(bookId));
    if (!data || Object.keys(data).length === 0) return null;
    return deserializeJobState(data);
}

// ─── Update Job Status ──────────────────────────────────────

export async function updateJobStatus(
    bookId: string,
    status: JobStatus,
    errorMessage?: string,
): Promise<void> {
    const redis = await getRedis();
    const updates: Record<string, string> = {
        status,
        updatedAt: String(Date.now()),
    };
    if (errorMessage !== undefined) {
        updates.errorMessage = errorMessage;
    }
    await redis.hset(JOB_KEY(bookId), updates);
}

// ─── Update Chapter Progress ────────────────────────────────

export async function updateChapterStatus(bookId: string, chapterIndex: number): Promise<void> {
    const redis = await getRedis();
    await redis.hset(JOB_KEY(bookId), {
        currentChapter: String(chapterIndex),
        updatedAt: String(Date.now()),
    });
}

// ─── Increment Processed Count ──────────────────────────────

export async function incrementProcessedChapters(bookId: string): Promise<number> {
    const redis = await getRedis();
    const newCount = await redis.hincrby(JOB_KEY(bookId), 'processedChapters', 1);
    await redis.hset(JOB_KEY(bookId), 'updatedAt', String(Date.now()));
    return newCount;
}

// ─── Check if Job is Complete ───────────────────────────────

export async function isJobComplete(bookId: string): Promise<boolean> {
    const redis = await getRedis();
    const [processed, total] = await Promise.all([
        redis.hget(JOB_KEY(bookId), 'processedChapters'),
        redis.hget(JOB_KEY(bookId), 'totalChapters'),
    ]);
    return Number(processed) >= Number(total);
}

// ─── Cancel Job ─────────────────────────────────────────────

export async function cancelJob(bookId: string): Promise<boolean> {
    const redis = await getRedis();
    const exists = await redis.exists(JOB_KEY(bookId));
    if (!exists) return false;

    await redis.hset(JOB_KEY(bookId), {
        status: 'cancelled',
        updatedAt: String(Date.now()),
    });

    // Publish cancellation event
    await publishJobEvent(bookId, {
        type: 'job_cancelled',
        bookId,
        timestamp: Date.now(),
    });

    return true;
}

// ─── Chapter Results ────────────────────────────────────────

export async function storeChapterResult(
    bookId: string,
    chapterIndex: number,
    result: ChapterResult,
): Promise<void> {
    const redis = await getRedis();
    await redis.setex(
        CHAPTER_KEY(bookId, chapterIndex),
        CHAPTER_RESULT_TTL,
        JSON.stringify(result),
    );
}

export async function getChapterResult(
    bookId: string,
    chapterIndex: number,
): Promise<ChapterResult | null> {
    const redis = await getRedis();
    const data = await redis.get(CHAPTER_KEY(bookId, chapterIndex));
    if (!data) return null;
    try {
        return JSON.parse(data) as ChapterResult;
    } catch {
        console.warn(
            `[JobManager] Corrupted chapter result for ${bookId}:${chapterIndex}, removing`,
        );
        await redis.del(CHAPTER_KEY(bookId, chapterIndex));
        return null;
    }
}

// ─── Event Publishing ───────────────────────────────────────

export async function publishJobEvent(bookId: string, event: JobEvent): Promise<void> {
    try {
        const redis = await getRedis();
        await redis.publish(EVENTS_CHANNEL(bookId), JSON.stringify(event));
    } catch {
        // Non-fatal: SSE listeners won't get this event but job continues
        console.warn(`[JobManager] Failed to publish event for ${bookId}`);
    }
}

export function getEventsChannel(bookId: string): string {
    return EVENTS_CHANNEL(bookId);
}

// ─── Serialization Helpers ──────────────────────────────────

function serializeJobState(state: JobState): Record<string, string> {
    return {
        bookId: state.bookId,
        title: state.title,
        status: state.status,
        provider: state.provider,
        totalChapters: String(state.totalChapters),
        processedChapters: String(state.processedChapters),
        currentChapter: String(state.currentChapter),
        errorMessage: state.errorMessage,
        createdAt: String(state.createdAt),
        updatedAt: String(state.updatedAt),
    };
}

const VALID_STATUSES: readonly JobStatus[] = [
    'queued',
    'processing',
    'completed',
    'failed',
    'cancelled',
];

function deserializeJobState(data: Record<string, string>): JobState {
    const rawStatus = data.status || 'queued';
    const status: JobStatus = VALID_STATUSES.includes(rawStatus as JobStatus)
        ? (rawStatus as JobStatus)
        : 'queued';

    return {
        bookId: data.bookId || '',
        title: data.title || '',
        status,
        provider: data.provider || '',
        totalChapters: Number(data.totalChapters) || 0,
        processedChapters: Number(data.processedChapters) || 0,
        currentChapter: Number(data.currentChapter) || 0,
        errorMessage: data.errorMessage || '',
        createdAt: Number(data.createdAt) || 0,
        updatedAt: Number(data.updatedAt) || 0,
    };
}
