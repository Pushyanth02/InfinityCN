/**
 * jobQueue.ts — Async Job Processing System
 *
 * Production-grade queue with:
 *   - Pluggable persistence (IndexedDB via Dexie or in-memory)
 *   - Configurable workers with concurrency control
 *   - Retry logic with exponential backoff
 *   - Progress tracking per job
 *   - Event-driven status notifications
 *   - Non-blocking: never touches UI thread beyond event emission
 *
 * Flow: Upload → Job Created → Worker Processes → Status Updates → Notification
 * States: pending → processing → completed | failed
 */

import Dexie from 'dexie';

// ─── Job Schema ────────────────────────────────────────────────────────────────

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type JobPriority = 'low' | 'normal' | 'high' | 'critical';

export interface Job<TPayload = unknown, TResult = unknown> {
    id: string;
    type: string;
    status: JobStatus;
    priority: JobPriority;
    payload: TPayload;
    result: TResult | null;
    error: string | null;
    progress: number;
    message: string;
    attempts: number;
    maxAttempts: number;
    createdAt: number;
    updatedAt: number;
    startedAt: number | null;
    completedAt: number | null;
    retryAfter: number;
    tags: string[];
    meta: Record<string, unknown>;
}

// ─── Worker Interface ──────────────────────────────────────────────────────────

export interface WorkerContext<TPayload = unknown> {
    job: Readonly<Job<TPayload>>;
    reportProgress: (percent: number, message?: string) => void;
    signal: AbortSignal;
}

export type WorkerProcess<TPayload = unknown, TResult = unknown> = (
    ctx: WorkerContext<TPayload>,
) => Promise<TResult>;

interface WorkerRegistration {
    type: string;
    process: WorkerProcess<unknown, unknown>;
    concurrency: number;
    activeCount: number;
}

// ─── Event System ──────────────────────────────────────────────────────────────

export type JobEventType =
    | 'job:created' | 'job:started' | 'job:progress'
    | 'job:completed' | 'job:failed' | 'job:retrying'
    | 'queue:drained' | 'queue:error';

export interface JobEvent<TPayload = unknown, TResult = unknown> {
    type: JobEventType;
    job: Job<TPayload, TResult>;
    timestamp: number;
}

export type JobEventListener = (event: JobEvent) => void;

// ─── Storage Backend Interface ─────────────────────────────────────────────────

export interface JobStorageBackend {
    get(id: string): Promise<Job | undefined>;
    put(job: Job): Promise<void>;
    bulkPut(jobs: Job[]): Promise<void>;
    update(id: string, changes: Partial<Job>): Promise<void>;
    delete(id: string): Promise<void>;
    bulkDelete(ids: string[]): Promise<void>;
    getAll(): Promise<Job[]>;
    getByStatus(status: JobStatus): Promise<Job[]>;
    getByType(type: string): Promise<Job[]>;
    countByStatus(status: JobStatus): Promise<number>;
    close(): void;
}

// ─── In-Memory Storage (for testing) ───────────────────────────────────────────

export class InMemoryJobStorage implements JobStorageBackend {
    private store = new Map<string, Job>();

    async get(id: string) { return this.store.get(id); }
    async put(job: Job) { this.store.set(job.id, { ...job }); }
    async bulkPut(jobs: Job[]) { for (const j of jobs) this.store.set(j.id, { ...j }); }
    async update(id: string, changes: Partial<Job>) {
        const existing = this.store.get(id);
        if (existing) this.store.set(id, { ...existing, ...changes });
    }
    async delete(id: string) { this.store.delete(id); }
    async bulkDelete(ids: string[]) { for (const id of ids) this.store.delete(id); }
    async getAll() { return [...this.store.values()].map(j => ({ ...j })); }
    async getByStatus(status: JobStatus) {
        return [...this.store.values()].filter(j => j.status === status).map(j => ({ ...j }));
    }
    async getByType(type: string) {
        return [...this.store.values()].filter(j => j.type === type).map(j => ({ ...j }));
    }
    async countByStatus(status: JobStatus) {
        return [...this.store.values()].filter(j => j.status === status).length;
    }
    close() { this.store.clear(); }
}

// ─── Dexie/IndexedDB Storage (production) ──────────────────────────────────────

export class DexieJobStorage implements JobStorageBackend {
    private db: import('dexie').default & { jobs: import('dexie').Table<Job> };

    constructor(dbName: string) {
        // Dynamic import avoided: Dexie is already a dependency
        this.db = new Dexie(dbName) as typeof this.db;
        this.db.version(1).stores({
            jobs: 'id, type, status, priority, createdAt, updatedAt, retryAfter',
        });
    }

    async get(id: string) { return this.db.jobs.get(id); }
    async put(job: Job) { await this.db.jobs.put(job); }
    async bulkPut(jobs: Job[]) { await this.db.jobs.bulkPut(jobs); }
    async update(id: string, changes: Partial<Job>) { await this.db.jobs.update(id, changes); }
    async delete(id: string) { await this.db.jobs.delete(id); }
    async bulkDelete(ids: string[]) { await this.db.jobs.bulkDelete(ids); }
    async getAll() { return this.db.jobs.orderBy('createdAt').reverse().toArray(); }
    async getByStatus(status: JobStatus) {
        return this.db.jobs.where('status').equals(status).reverse().sortBy('createdAt');
    }
    async getByType(type: string) {
        return this.db.jobs.where('type').equals(type).reverse().sortBy('createdAt');
    }
    async countByStatus(status: JobStatus) {
        return this.db.jobs.where('status').equals(status).count();
    }
    close() { this.db.close(); }
}

// ─── Queue Options ─────────────────────────────────────────────────────────────

export interface JobQueueOptions {
    /** Custom storage backend (default: DexieJobStorage) */
    storage?: JobStorageBackend;
    /** Database name for default Dexie storage */
    dbName?: string;
    maxConcurrency?: number;
    defaultMaxAttempts?: number;
    retryBaseDelayMs?: number;
    retryMaxDelayMs?: number;
    pollIntervalMs?: number;
    maxJobAgeMs?: number;
    autoStart?: boolean;
}

// ─── Priority Ordering ─────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<JobPriority, number> = { critical: 4, high: 3, normal: 2, low: 1 };

// ─── ID Generation ─────────────────────────────────────────────────────────────

let idCounter = 0;
function generateJobId(type: string): string {
    const random = Math.random().toString(36).slice(2, 8);
    idCounter = (idCounter + 1) % 10000;
    return `job-${type}-${Date.now()}-${idCounter}-${random}`;
}

// ─── JobQueue ──────────────────────────────────────────────────────────────────

export class JobQueue {
    private readonly store: JobStorageBackend;
    private readonly workers = new Map<string, WorkerRegistration>();
    private readonly listeners = new Map<JobEventType, Set<JobEventListener>>();
    private readonly abortControllers = new Map<string, AbortController>();
    private readonly opts: Required<Omit<JobQueueOptions, 'storage'>>;

    private pollTimer: ReturnType<typeof setInterval> | null = null;
    private running = false;
    private globalActiveCount = 0;
    private processing = false;

    constructor(options: JobQueueOptions = {}) {
        this.opts = {
            dbName: options.dbName ?? 'InfinityCNJobQueue',
            maxConcurrency: Math.max(1, options.maxConcurrency ?? 3),
            defaultMaxAttempts: Math.max(1, options.defaultMaxAttempts ?? 3),
            retryBaseDelayMs: Math.max(10, options.retryBaseDelayMs ?? 1000),
            retryMaxDelayMs: Math.max(100, options.retryMaxDelayMs ?? 30000),
            pollIntervalMs: Math.max(10, options.pollIntervalMs ?? 500),
            maxJobAgeMs: options.maxJobAgeMs ?? 7 * 24 * 60 * 60 * 1000,
            autoStart: options.autoStart ?? true,
        };

        this.store = options.storage ?? new DexieJobStorage(this.opts.dbName);

        if (this.opts.autoStart) {
            queueMicrotask(() => this.start());
        }
    }

    // ─── Worker Registration ─────────────────────────────────

    registerWorker<TP = unknown, TR = unknown>(
        type: string, process: WorkerProcess<TP, TR>, concurrency = 1,
    ): void {
        if (this.workers.has(type)) throw new Error(`Worker for type "${type}" is already registered.`);
        this.workers.set(type, {
            type, process: process as WorkerProcess<unknown, unknown>,
            concurrency: Math.max(1, concurrency), activeCount: 0,
        });
    }

    unregisterWorker(type: string): void { this.workers.delete(type); }

    // ─── Job Creation ────────────────────────────────────────

    async enqueue<TP = unknown>(
        type: string, payload: TP,
        options?: { priority?: JobPriority; maxAttempts?: number; tags?: string[]; meta?: Record<string, unknown> },
    ): Promise<Job<TP>> {
        const now = Date.now();
        const job: Job<TP> = {
            id: generateJobId(type), type, status: 'pending',
            priority: options?.priority ?? 'normal', payload,
            result: null, error: null, progress: 0, message: 'Waiting in queue...',
            attempts: 0, maxAttempts: Math.max(1, options?.maxAttempts ?? this.opts.defaultMaxAttempts),
            createdAt: now, updatedAt: now, startedAt: null, completedAt: null,
            retryAfter: 0, tags: options?.tags ?? [], meta: options?.meta ?? {},
        };
        await this.store.put(job as Job);
        this.emit('job:created', job as Job);
        queueMicrotask(() => this.processNext());
        return job;
    }

    async enqueueBatch<TP = unknown>(
        jobs: Array<{ type: string; payload: TP; priority?: JobPriority; tags?: string[]; meta?: Record<string, unknown> }>,
    ): Promise<Job<TP>[]> {
        const now = Date.now();
        const created: Job<TP>[] = jobs.map(j => ({
            id: generateJobId(j.type), type: j.type, status: 'pending' as const,
            priority: j.priority ?? 'normal', payload: j.payload,
            result: null, error: null, progress: 0, message: 'Waiting in queue...',
            attempts: 0, maxAttempts: this.opts.defaultMaxAttempts,
            createdAt: now, updatedAt: now, startedAt: null, completedAt: null,
            retryAfter: 0, tags: j.tags ?? [], meta: j.meta ?? {},
        }));
        await this.store.bulkPut(created as Job[]);
        for (const job of created) this.emit('job:created', job as Job);
        queueMicrotask(() => this.processNext());
        return created;
    }

    // ─── Job Queries ─────────────────────────────────────────

    async getJob<TP = unknown, TR = unknown>(id: string): Promise<Job<TP, TR> | null> {
        return ((await this.store.get(id)) as Job<TP, TR>) ?? null;
    }
    async getJobsByType(type: string): Promise<Job[]> { return this.store.getByType(type); }
    async getJobsByStatus(status: JobStatus): Promise<Job[]> { return this.store.getByStatus(status); }
    async getAllJobs(): Promise<Job[]> { return this.store.getAll(); }

    async getStatusCounts(): Promise<Record<JobStatus, number>> {
        const all = await this.store.getAll();
        const counts: Record<JobStatus, number> = { pending: 0, processing: 0, completed: 0, failed: 0 };
        for (const job of all) counts[job.status]++;
        return counts;
    }

    // ─── Job Control ─────────────────────────────────────────

    async cancelJob(id: string): Promise<boolean> {
        const job = await this.store.get(id);
        if (!job) return false;
        if (job.status === 'processing') {
            this.abortControllers.get(id)?.abort();
            this.abortControllers.delete(id);
        }
        if (job.status === 'pending' || job.status === 'processing') {
            await this.updateJob(id, { status: 'failed', error: 'Cancelled by user', message: 'Job cancelled.', completedAt: Date.now() });
            return true;
        }
        return false;
    }

    async retryJob(id: string): Promise<boolean> {
        const job = await this.store.get(id);
        if (!job || job.status !== 'failed') return false;
        await this.updateJob(id, { status: 'pending', error: null, progress: 0, message: 'Retrying...', attempts: 0, retryAfter: 0, completedAt: null, startedAt: null });
        queueMicrotask(() => this.processNext());
        return true;
    }

    async removeJob(id: string): Promise<boolean> {
        const job = await this.store.get(id);
        if (!job || job.status === 'processing') return false;
        await this.store.delete(id);
        return true;
    }

    async clearFinished(): Promise<number> {
        const finished = (await this.store.getAll()).filter(j => j.status === 'completed' || j.status === 'failed');
        await this.store.bulkDelete(finished.map(j => j.id));
        return finished.length;
    }

    async pruneOldJobs(): Promise<number> {
        const cutoff = Date.now() - this.opts.maxJobAgeMs;
        const old = (await this.store.getAll()).filter(j => j.createdAt < cutoff && (j.status === 'completed' || j.status === 'failed'));
        await this.store.bulkDelete(old.map(j => j.id));
        return old.length;
    }

    // ─── Queue Lifecycle ─────────────────────────────────────

    start(): void {
        if (this.running) return;
        this.running = true;
        this.recoverStaleJobs().catch(e => console.warn('[JobQueue] Stale recovery error:', e));
        this.pollTimer = setInterval(() => { this.processNext().catch(() => {}); }, this.opts.pollIntervalMs);
        this.processNext().catch(() => {});
    }

    stop(): void {
        this.running = false;
        if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    }

    isRunning(): boolean { return this.running; }

    async destroy(): Promise<void> {
        this.stop();
        for (const [, c] of this.abortControllers) c.abort();
        this.abortControllers.clear();
        this.listeners.clear();
        this.store.close();
    }

    // ─── Event System ────────────────────────────────────────

    on(event: JobEventType, listener: JobEventListener): () => void {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
        this.listeners.get(event)!.add(listener);
        return () => { this.listeners.get(event)?.delete(listener); };
    }

    onAny(listener: JobEventListener): () => void {
        const unsubs = (['job:created','job:started','job:progress','job:completed','job:failed','job:retrying','queue:drained','queue:error'] as JobEventType[]).map(e => this.on(e, listener));
        return () => unsubs.forEach(u => u());
    }

    private emit(type: JobEventType, job: Job): void {
        const event: JobEvent = { type, job, timestamp: Date.now() };
        const set = this.listeners.get(type);
        if (!set) return;
        for (const fn of set) { try { fn(event); } catch (e) { console.warn(`[JobQueue] Listener error (${type}):`, e); } }
    }

    // ─── Internal Processing ─────────────────────────────────

    private async processNext(): Promise<void> {
        if (!this.running || this.processing || this.globalActiveCount >= this.opts.maxConcurrency) return;
        this.processing = true;
        try {
            const job = await this.pickNextJob();
            if (!job) {
                if (this.globalActiveCount === 0 && (await this.store.countByStatus('pending')) === 0) {
                    this.emit('queue:drained', { id: '', type: '', status: 'completed' } as Job);
                }
                return;
            }
            const worker = this.workers.get(job.type);
            if (!worker) {
                await this.updateJob(job.id, { status: 'failed', error: `No worker registered for job type "${job.type}"`, message: 'No worker available.', completedAt: Date.now() });
                const j = await this.store.get(job.id);
                if (j) this.emit('job:failed', j);
                return;
            }
            if (worker.activeCount >= worker.concurrency) return;
            void this.executeJob(job, worker);
            queueMicrotask(() => { this.processing = false; this.processNext().catch(() => {}); });
        } finally { this.processing = false; }
    }

    private async pickNextJob(): Promise<Job | null> {
        const now = Date.now();
        const pending = (await this.store.getByStatus('pending')).filter(j => j.retryAfter <= now);
        if (pending.length === 0) return null;
        pending.sort((a, b) => {
            const pd = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
            return pd !== 0 ? pd : a.createdAt - b.createdAt;
        });
        // Prefer jobs with available worker slots, but also return unregistered jobs
        // so processNext can fail them with a clear error
        for (const job of pending) {
            const w = this.workers.get(job.type);
            if (!w) return job; // no worker → processNext will fail it
            if (w.activeCount < w.concurrency) return job;
        }
        return null;
    }

    private async executeJob(job: Job, worker: WorkerRegistration): Promise<void> {
        const controller = new AbortController();
        this.abortControllers.set(job.id, controller);
        worker.activeCount++;
        this.globalActiveCount++;

        await this.updateJob(job.id, { status: 'processing', startedAt: Date.now(), attempts: job.attempts + 1, progress: 0, message: 'Processing...' });
        const updated = await this.store.get(job.id);
        if (updated) this.emit('job:started', updated);

        const ctx: WorkerContext = {
            job: updated ?? job,
            signal: controller.signal,
            reportProgress: (pct: number, msg?: string) => {
                const clamped = Math.max(0, Math.min(100, Math.round(pct)));
                void this.updateJob(job.id, { progress: clamped, message: msg ?? `Processing (${clamped}%)...` })
                    .then(() => this.store.get(job.id).then(j => { if (j) this.emit('job:progress', j); }).catch(() => {}))
                    .catch(() => {});
            },
        };

        try {
            const result = await worker.process(ctx);
            if (controller.signal.aborted) return;
            await this.updateJob(job.id, { status: 'completed', result, progress: 100, message: 'Completed successfully.', completedAt: Date.now(), error: null });
            const done = await this.store.get(job.id);
            if (done) this.emit('job:completed', done);
        } catch (err) {
            if (controller.signal.aborted) return;
            const errorMsg = err instanceof Error ? err.message : String(err);
            const current = await this.store.get(job.id);
            if (!current) return;
            if (current.attempts < current.maxAttempts) {
                const delay = this.computeRetryDelay(current.attempts);
                await this.updateJob(job.id, { status: 'pending', retryAfter: Date.now() + delay, error: errorMsg, message: `Retrying in ${Math.ceil(delay / 1000)}s (attempt ${current.attempts}/${current.maxAttempts})...`, progress: 0 });
                const r = await this.store.get(job.id);
                if (r) this.emit('job:retrying', r);
            } else {
                await this.updateJob(job.id, { status: 'failed', error: errorMsg, message: `Failed after ${current.attempts} attempt${current.attempts === 1 ? '' : 's'}.`, completedAt: Date.now() });
                const f = await this.store.get(job.id);
                if (f) this.emit('job:failed', f);
            }
        } finally {
            this.abortControllers.delete(job.id);
            worker.activeCount = Math.max(0, worker.activeCount - 1);
            this.globalActiveCount = Math.max(0, this.globalActiveCount - 1);
            queueMicrotask(() => this.processNext().catch(() => {}));
        }
    }

    private computeRetryDelay(attempt: number): number {
        const base = this.opts.retryBaseDelayMs * 2 ** (attempt - 1);
        const jitter = Math.random() * this.opts.retryBaseDelayMs * 0.5;
        return Math.min(base + jitter, this.opts.retryMaxDelayMs);
    }

    private async recoverStaleJobs(): Promise<void> {
        const stale = await this.store.getByStatus('processing');
        for (const job of stale) {
            if (job.attempts < job.maxAttempts) {
                await this.updateJob(job.id, { status: 'pending', retryAfter: 0, message: 'Recovered after app restart.' });
            } else {
                await this.updateJob(job.id, { status: 'failed', error: 'Interrupted by restart.', message: 'Failed: interrupted.', completedAt: Date.now() });
            }
        }
    }

    private async updateJob(id: string, updates: Partial<Job>): Promise<void> {
        await this.store.update(id, { ...updates, updatedAt: Date.now() });
    }
}

// ─── Singleton ─────────────────────────────────────────────────────────────────

let defaultQueue: JobQueue | null = null;

export function getJobQueue(options?: JobQueueOptions): JobQueue {
    if (!defaultQueue) defaultQueue = new JobQueue(options);
    return defaultQueue;
}

export async function resetJobQueue(): Promise<void> {
    if (defaultQueue) { await defaultQueue.destroy(); defaultQueue = null; }
}
