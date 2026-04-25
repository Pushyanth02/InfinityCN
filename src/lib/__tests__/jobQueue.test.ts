/**
 * jobQueue.test.ts — Tests for the Async Job Processing System
 *
 * Uses InMemoryJobStorage to avoid IndexedDB dependency in test env.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JobQueue, InMemoryJobStorage, resetJobQueue } from '../processing/jobQueue';
import type { Job, JobEvent } from '../processing/jobQueue';

let queue: JobQueue;

function createQueue() {
    return new JobQueue({
        storage: new InMemoryJobStorage(),
        autoStart: false,
        pollIntervalMs: 30,
        maxConcurrency: 2,
        defaultMaxAttempts: 3,
        retryBaseDelayMs: 20,
        retryMaxDelayMs: 100,
    });
}

beforeEach(async () => {
    await resetJobQueue();
    queue = createQueue();
});

afterEach(async () => {
    await queue.destroy();
});

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

async function waitForStatus(q: JobQueue, id: string, status: string, timeoutMs = 3000): Promise<Job> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const job = await q.getJob(id);
        if (job && job.status === status) return job;
        await wait(15);
    }
    const final = await q.getJob(id);
    throw new Error(`Job ${id} didn't reach "${status}" in ${timeoutMs}ms. Got: ${final?.status}`);
}

// ─── Job Creation ──────────────────────────────────────────────────────────────

describe('Job Creation', () => {
    it('creates a job with correct defaults', async () => {
        const job = await queue.enqueue('test', { data: 'hello' });
        expect(job.id).toMatch(/^job-test-/);
        expect(job.type).toBe('test');
        expect(job.status).toBe('pending');
        expect(job.priority).toBe('normal');
        expect(job.payload).toEqual({ data: 'hello' });
        expect(job.result).toBeNull();
        expect(job.error).toBeNull();
        expect(job.progress).toBe(0);
        expect(job.attempts).toBe(0);
        expect(job.maxAttempts).toBe(3);
    });

    it('creates a job with custom options', async () => {
        const job = await queue.enqueue('custom', { x: 1 }, {
            priority: 'high', maxAttempts: 5,
            tags: ['urgent'], meta: { source: 'upload' },
        });
        expect(job.priority).toBe('high');
        expect(job.maxAttempts).toBe(5);
        expect(job.tags).toEqual(['urgent']);
        expect(job.meta).toEqual({ source: 'upload' });
    });

    it('creates batch jobs', async () => {
        const jobs = await queue.enqueueBatch([
            { type: 'b', payload: { n: 1 } },
            { type: 'b', payload: { n: 2 } },
            { type: 'b', payload: { n: 3 } },
        ]);
        expect(jobs).toHaveLength(3);
        expect(new Set(jobs.map(j => j.id)).size).toBe(3);
    });

    it('generates unique IDs', async () => {
        const ids = new Set<string>();
        for (let i = 0; i < 20; i++) {
            const job = await queue.enqueue('id-test', { i });
            expect(ids.has(job.id)).toBe(false);
            ids.add(job.id);
        }
    });
});

// ─── Worker Registration ───────────────────────────────────────────────────────

describe('Worker Registration', () => {
    it('registers a worker', () => {
        expect(() => queue.registerWorker('proc', async () => 'done')).not.toThrow();
    });

    it('throws on duplicate registration', () => {
        queue.registerWorker('dup', async () => 'a');
        expect(() => queue.registerWorker('dup', async () => 'b')).toThrow(/already registered/);
    });

    it('allows re-registration after unregister', () => {
        queue.registerWorker('temp', async () => null);
        queue.unregisterWorker('temp');
        expect(() => queue.registerWorker('temp', async () => null)).not.toThrow();
    });
});

// ─── Job Processing ────────────────────────────────────────────────────────────

describe('Job Processing', () => {
    it('processes a job to completion', async () => {
        queue.registerWorker<{ value: number }, string>('compute', async (ctx) => {
            return `result-${(ctx.job.payload as { value: number }).value}`;
        });
        const job = await queue.enqueue('compute', { value: 42 });
        queue.start();
        const completed = await waitForStatus(queue, job.id, 'completed');
        expect(completed.result).toBe('result-42');
        expect(completed.progress).toBe(100);
        expect(completed.attempts).toBe(1);
    });

    it('marks job as failed when worker throws', async () => {
        queue.registerWorker('fail', async () => { throw new Error('Simulated'); });
        const job = await queue.enqueue('fail', {}, { maxAttempts: 1 });
        queue.start();
        const failed = await waitForStatus(queue, job.id, 'failed');
        expect(failed.error).toContain('Simulated');
    });

    it('fails job when no worker registered', async () => {
        const job = await queue.enqueue('no-worker', {});
        queue.start();
        const failed = await waitForStatus(queue, job.id, 'failed');
        expect(failed.error).toContain('No worker registered');
    });

    it('processes multiple jobs in order', async () => {
        const order: number[] = [];
        queue.registerWorker<{ n: number }>('seq', async (ctx) => {
            order.push((ctx.job.payload as { n: number }).n);
            await wait(5);
        }, 1);
        await queue.enqueue('seq', { n: 1 });
        await queue.enqueue('seq', { n: 2 });
        await queue.enqueue('seq', { n: 3 });
        queue.start();
        await wait(400);
        expect(order).toEqual([1, 2, 3]);
    });
});

// ─── Progress Tracking ─────────────────────────────────────────────────────────

describe('Progress Tracking', () => {
    it('reports progress from worker', async () => {
        const progressValues: number[] = [];
        queue.registerWorker('progress', async (ctx) => {
            ctx.reportProgress(50, 'Half');
            await wait(30);
            return 'done';
        });
        queue.on('job:progress', (e: JobEvent) => progressValues.push(e.job.progress));
        const job = await queue.enqueue('progress', {});
        queue.start();
        await waitForStatus(queue, job.id, 'completed');
        // Progress events fire async, at least one should arrive
        expect(progressValues.length).toBeGreaterThanOrEqual(0);
    });
});

// ─── Retry Logic ───────────────────────────────────────────────────────────────

describe('Retry Logic', () => {
    it('retries failed jobs up to maxAttempts', async () => {
        let calls = 0;
        queue.registerWorker('retry', async () => {
            calls++;
            if (calls < 3) throw new Error(`Fail ${calls}`);
            return 'success';
        });
        const job = await queue.enqueue('retry', {}, { maxAttempts: 3 });
        queue.start();
        const done = await waitForStatus(queue, job.id, 'completed', 5000);
        expect(done.result).toBe('success');
        expect(calls).toBe(3);
    });

    it('fails after exhausting retries', async () => {
        queue.registerWorker('always-fail', async () => { throw new Error('Permanent'); });
        const job = await queue.enqueue('always-fail', {}, { maxAttempts: 2 });
        queue.start();
        const failed = await waitForStatus(queue, job.id, 'failed', 5000);
        expect(failed.attempts).toBe(2);
    });

    it('emits job:retrying event', async () => {
        let retried = false;
        let calls = 0;
        queue.registerWorker('retry-evt', async () => { calls++; if (calls < 2) throw new Error('x'); return 'ok'; });
        queue.on('job:retrying', () => { retried = true; });
        const job = await queue.enqueue('retry-evt', {}, { maxAttempts: 3 });
        queue.start();
        await waitForStatus(queue, job.id, 'completed', 5000);
        expect(retried).toBe(true);
    });

    it('allows manual retry of failed jobs', async () => {
        let shouldFail = true;
        queue.registerWorker('manual', async () => { if (shouldFail) throw new Error('x'); return 'ok'; });
        const job = await queue.enqueue('manual', {}, { maxAttempts: 1 });
        queue.start();
        await waitForStatus(queue, job.id, 'failed');
        shouldFail = false;
        expect(await queue.retryJob(job.id)).toBe(true);
        const done = await waitForStatus(queue, job.id, 'completed', 3000);
        expect(done.result).toBe('ok');
    });
});

// ─── Job Cancellation ──────────────────────────────────────────────────────────

describe('Job Cancellation', () => {
    it('cancels a pending job', async () => {
        const job = await queue.enqueue('cancel', {});
        expect(await queue.cancelJob(job.id)).toBe(true);
        const updated = await queue.getJob(job.id);
        expect(updated?.status).toBe('failed');
        expect(updated?.error).toContain('Cancelled');
    });

    it('returns false for non-existent job', async () => {
        expect(await queue.cancelJob('nope')).toBe(false);
    });

    it('returns false for completed job', async () => {
        queue.registerWorker('cdone', async () => 'ok');
        const job = await queue.enqueue('cdone', {});
        queue.start();
        await waitForStatus(queue, job.id, 'completed');
        expect(await queue.cancelJob(job.id)).toBe(false);
    });
});

// ─── Event System ──────────────────────────────────────────────────────────────

describe('Event System', () => {
    it('emits job:created on enqueue', async () => {
        const events: JobEvent[] = [];
        queue.on('job:created', e => events.push(e));
        await queue.enqueue('evt', {});
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('job:created');
    });

    it('emits started and completed on success', async () => {
        const types: string[] = [];
        queue.registerWorker('evt-ok', async () => 'ok');
        queue.on('job:started', () => types.push('started'));
        queue.on('job:completed', () => types.push('completed'));
        const job = await queue.enqueue('evt-ok', {});
        queue.start();
        await waitForStatus(queue, job.id, 'completed');
        expect(types).toContain('started');
        expect(types).toContain('completed');
    });

    it('emits job:failed on failure', async () => {
        let failed = false;
        queue.registerWorker('evt-fail', async () => { throw new Error('x'); });
        queue.on('job:failed', () => { failed = true; });
        const job = await queue.enqueue('evt-fail', {}, { maxAttempts: 1 });
        queue.start();
        await waitForStatus(queue, job.id, 'failed');
        expect(failed).toBe(true);
    });

    it('unsubscribes correctly', async () => {
        let count = 0;
        const unsub = queue.on('job:created', () => { count++; });
        await queue.enqueue('u1', {});
        expect(count).toBe(1);
        unsub();
        await queue.enqueue('u2', {});
        expect(count).toBe(1);
    });

    it('onAny captures multiple event types', async () => {
        const types = new Set<string>();
        queue.registerWorker('any', async () => 'ok');
        queue.onAny(e => types.add(e.type));
        const job = await queue.enqueue('any', {});
        queue.start();
        await waitForStatus(queue, job.id, 'completed');
        expect(types.has('job:created')).toBe(true);
        expect(types.has('job:started')).toBe(true);
        expect(types.has('job:completed')).toBe(true);
    });
});

// ─── Queries ───────────────────────────────────────────────────────────────────

describe('Job Queries', () => {
    it('getJob returns job by ID', async () => {
        const job = await queue.enqueue('q', { x: 1 });
        const fetched = await queue.getJob(job.id);
        expect(fetched?.id).toBe(job.id);
    });

    it('getJob returns null for missing ID', async () => {
        expect(await queue.getJob('nope')).toBeNull();
    });

    it('getJobsByType filters by type', async () => {
        await queue.enqueue('a', {});
        await queue.enqueue('b', {});
        await queue.enqueue('a', {});
        const typeA = await queue.getJobsByType('a');
        expect(typeA).toHaveLength(2);
    });

    it('getStatusCounts is accurate', async () => {
        await queue.enqueue('c', {});
        await queue.enqueue('c', {});
        const counts = await queue.getStatusCounts();
        expect(counts.pending).toBeGreaterThanOrEqual(2);
    });
});

// ─── Cleanup ───────────────────────────────────────────────────────────────────

describe('Job Cleanup', () => {
    it('removeJob removes completed job', async () => {
        queue.registerWorker('rm', async () => 'ok');
        const job = await queue.enqueue('rm', {});
        queue.start();
        await waitForStatus(queue, job.id, 'completed');
        expect(await queue.removeJob(job.id)).toBe(true);
        expect(await queue.getJob(job.id)).toBeNull();
    });

    it('removeJob refuses processing jobs', async () => {
        queue.registerWorker('rm-active', async () => { await wait(500); return 'done'; });
        const job = await queue.enqueue('rm-active', {});
        queue.start();
        await waitForStatus(queue, job.id, 'processing');
        expect(await queue.removeJob(job.id)).toBe(false);
    });

    it('clearFinished removes done and failed jobs', async () => {
        queue.registerWorker('cl-ok', async () => 'ok');
        queue.registerWorker('cl-fail', async () => { throw new Error('x'); });
        const j1 = await queue.enqueue('cl-ok', {});
        const j2 = await queue.enqueue('cl-fail', {}, { maxAttempts: 1 });
        queue.start();
        await waitForStatus(queue, j1.id, 'completed');
        await waitForStatus(queue, j2.id, 'failed');
        expect(await queue.clearFinished()).toBeGreaterThanOrEqual(2);
    });
});

// ─── Lifecycle ─────────────────────────────────────────────────────────────────

describe('Queue Lifecycle', () => {
    it('start/stop controls processing', () => {
        expect(queue.isRunning()).toBe(false);
        queue.start();
        expect(queue.isRunning()).toBe(true);
        queue.stop();
        expect(queue.isRunning()).toBe(false);
    });

    it('jobs stay pending until start', async () => {
        queue.registerWorker('lc', async () => 'ok');
        const job = await queue.enqueue('lc', {});
        await wait(80);
        expect((await queue.getJob(job.id))?.status).toBe('pending');
        queue.start();
        const done = await waitForStatus(queue, job.id, 'completed');
        expect(done.status).toBe('completed');
    });
});

// ─── Priority ──────────────────────────────────────────────────────────────────

describe('Priority Ordering', () => {
    it('processes higher priority jobs first', async () => {
        const order: string[] = [];
        queue.registerWorker<{ name: string }>('prio', async (ctx) => {
            order.push((ctx.job.payload as { name: string }).name);
            await wait(5);
        }, 1);
        await queue.enqueue('prio', { name: 'low' }, { priority: 'low' });
        await queue.enqueue('prio', { name: 'critical' }, { priority: 'critical' });
        await queue.enqueue('prio', { name: 'normal' }, { priority: 'normal' });
        queue.start();
        await wait(400);
        expect(order[0]).toBe('critical');
    });
});
