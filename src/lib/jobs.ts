/**
 * Background job runner.
 *
 * Long AI work (Ankaa drafts, deep analyses, scene cinematization) runs as a
 * queued job with:
 *   - bounded concurrency (2 simultaneous)
 *   - persisted progress rows (the `jobs` store) so the header tray and any
 *     view can observe via the normal data hooks
 *   - live word counts + ETA derived from elapsed time, smoothed via a
 *     rolling 3-sample window rather than a single point estimate
 *   - per-job AbortController so a running job can be cancelled by the user
 *     via `cancelJob(id)` — the controller's signal is passed to `spec.run`
 *   - priority queue: luma (chat) jobs jump the line so the companion feels
 *     instant even when Ankaa is mid-draft
 *   - crash recovery: rows stuck in running for > 5 min are marked failed on
 *     boot; recently-updated rows are left alone in case another tab still
 *     owns them (with a console warning for observability)
 *
 * The runner is the local-first analogue of a server job queue + Redis
 * pub/sub: persistence in IndexedDB, notification through the version bus.
 */
import type { AnalysisJob, BotId } from "./types";
import { idbAll, idbPut, idbDelete, getUserId } from "./db";
import { uid } from "./utils";
import { bump } from "./data";

export interface JobReport {
  /** step index within spec.steps */
  step: number;
  /** 0..1 fraction of the current step */
  fraction: number;
  words?: number;
}

export interface JobSpec<R> {
  label: string;
  bot?: BotId;
  kind?: string;
  documentId?: string | null;
  steps: string[];
  /**
   * The work to run. The runner passes a `report` callback to stream
   * progress, and an `AbortSignal` the work can consult to bail out
   * mid-flight if the user cancels the job via `cancelJob`.
   *
   * Backward compatible: callers written before the signal was added still
   * pass `(report) => Promise<R>` and simply ignore the second argument —
   * TypeScript treats a function with fewer params as assignable to one
   * that accepts more, so no caller has to change.
   */
  run: (report: (r: JobReport) => void, signal?: AbortSignal) => Promise<R>;
  onDone?: (result: R, row: AnalysisJob) => void | Promise<void>;
  onError?: (err: Error, row: AnalysisJob) => void | Promise<void>;
  /** transient-failure retries (backoff). Quota/auth errors are never retried. */
  retries?: number;
  /**
   * Queue priority — higher numbers run sooner. Default 0.
   * Luma (chat) jobs are auto-bumped ahead of long Ankaa work so the
   * companion never stalls behind a draft.
   */
  priority?: number;
}

/** Errors that will never succeed on retry — fail fast instead of burning time. */
function isFatal(e: unknown): boolean {
  return (
    e instanceof Error && /quota|api key|rejected|unavailable/i.test(e.message)
  );
}

async function withRetry<R>(
  fn: () => Promise<R>,
  retries: number,
  onAttempt: (n: number) => void,
  signal?: AbortSignal,
): Promise<R> {
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Bail before each attempt if cancelled — never resurrect a cancelled job.
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      return await fn();
    } catch (e) {
      last = e;
      // Cancellation is not retryable — surface it immediately so the
      // outer catch can label the row "Cancelled by user.".
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (isFatal(e) || attempt === retries) throw e;
      onAttempt(attempt + 1);
      await new Promise((r) => setTimeout(r, 900 * (attempt + 1)));
    }
  }
  throw last;
}

interface QueueEntry {
  /** higher = sooner */
  priority: number;
  /** monotonic insertion order — breaks priority ties stably (FIFO). */
  seq: number;
  fn: () => Promise<void>;
}

const queue: QueueEntry[] = [];
let active = 0;
const MAX_ACTIVE = 2;
let recovered = false;
let seqCounter = 0;

/** Luma jobs (chat) get bumped ahead of long Ankaa work so the companion feels instant. */
const LUMA_PRIORITY_BUMP = 10;
/** Threshold for "this job is probably still running in another tab". */
const RECENT_MS = 5 * 60 * 1000;
/** Rolling-average window for the smoothed ETA. */
const ETA_WINDOW = 3;
/** Terminal jobs older than this are auto-deleted to keep the job tray clean.
 *  30 minutes — long enough to see "just finished" status, short enough that
 *  the tray doesn't fill with ancient history. */
const REAP_AFTER_MS = 30 * 60 * 1000;

/** Per-job AbortControllers — `cancelJob(id)` aborts the matching controller. */
const controllers = new Map<string, AbortController>();

function effectivePriority<R>(spec: JobSpec<R>): number {
  const base = spec.priority ?? 0;
  return spec.bot === "luma" ? Math.max(base, LUMA_PRIORITY_BUMP) : base;
}

/** Stable priority insertion: highest priority first, FIFO within a tier. */
function enqueueEntry<R>(spec: JobSpec<R>, fn: () => Promise<void>): void {
  const entry: QueueEntry = {
    priority: effectivePriority(spec),
    seq: seqCounter++,
    fn,
  };
  let i = queue.length;
  while (
    i > 0 &&
    (queue[i - 1]?.priority ?? Number.NEGATIVE_INFINITY) < entry.priority
  )
    i--;
  queue.splice(i, 0, entry);
}

function pump(): void {
  while (active < MAX_ACTIVE && queue.length > 0) {
    const next = queue.shift();
    if (!next) break;
    active++;
    void next.fn().finally(() => {
      active--;
      pump();
    });
  }
}

/** Call once at boot; idempotent. */
export async function recoverStaleJobs(): Promise<void> {
  if (recovered) return;
  recovered = true;
  try {
    const rows = await idbAll<AnalysisJob>("jobs");
    const now = Date.now();
    const stale: AnalysisJob[] = [];
    const recent: AnalysisJob[] = [];
    for (const j of rows) {
      if (j.status !== "running" && j.status !== "queued") continue;
      const age = now - j.updatedAt;
      if (age > RECENT_MS) stale.push(j);
      else recent.push(j);
    }
    for (const j of stale) {
      await idbPut("jobs", {
        ...j,
        status: "failed",
        error: "Interrupted — the app reloaded mid-job.",
        updatedAt: Date.now(),
      });
    }
    // Recently-updated jobs MIGHT still be running in another tab. Use a
    // BroadcastChannel to ask: "is anyone actually running this job?" If no
    // tab claims it within a short window, mark it as interrupted so the UI
    // doesn't show a phantom spinner forever after a crashed tab.
    if (recent.length) {
      await probeAndRecoverRecent(recent);
    }
    if (stale.length || recent.length) bump("jobs");
  } catch {
    /* nothing to recover */
  }
}

/* ────────────────────────────────────────────────────────────
   Cross-tab liveness probe for "recent" running jobs.
   
   When the app boots and finds jobs updated <5 min ago, we can't tell
   whether they're genuinely running in another tab or were abandoned by
   a crashed tab. We use a BroadcastChannel to ask all tabs: "are you
   running job X?" Any tab currently executing a job responds with its
   job ID. Jobs that get no response within the probe window are presumed
   abandoned and marked as interrupted.
   ──────────────────────────────────────────────────────────── */
const JOB_CHANNEL =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("lemniscate-jobs")
    : null;

/** Set of job IDs that this tab is actively running (populated by enqueueJob). */
const activeJobIds = new Set<string>();

// Listen for liveness probes from other tabs.
if (JOB_CHANNEL) {
  JOB_CHANNEL.onmessage = (e: MessageEvent) => {
    const msg = e.data as { type: string; jobId?: string };
    if (msg?.type === "probe" && msg.jobId && activeJobIds.has(msg.jobId)) {
      JOB_CHANNEL.postMessage({ type: "alive", jobId: msg.jobId });
    }
  };
}

/** Probe all tabs for ownership of recent jobs. Any job that gets no "alive"
 *  response within the window is presumed abandoned and marked interrupted. */
async function probeAndRecoverRecent(recent: AnalysisJob[]): Promise<void> {
  if (!JOB_CHANNEL) {
    // No BroadcastChannel support (older browsers) — fall back to marking
    // them all as interrupted, since we have no way to verify cross-tab.
    for (const j of recent) {
      await idbPut("jobs", {
        ...j,
        status: "failed",
        error: "Interrupted — the app reloaded mid-job.",
        updatedAt: Date.now(),
      });
    }
    return;
  }

  const probeIds = recent.map((j) => j.id);
  const aliveIds = new Set<string>();

  // Send a probe for each recent job and collect "alive" responses.
  const probePromise = new Promise<void>((resolve) => {
    const handler = (e: MessageEvent) => {
      const msg = e.data as { type: string; jobId?: string };
      if (msg?.type === "alive" && msg.jobId) aliveIds.add(msg.jobId);
    };
    JOB_CHANNEL.addEventListener("message", handler);
    for (const id of probeIds)
      JOB_CHANNEL.postMessage({ type: "probe", jobId: id });
    // Wait a short window for responses. 800ms is long enough for an
    // idle tab to respond to a BroadcastChannel message, short enough to
    // not noticeably delay boot.
    setTimeout(() => {
      JOB_CHANNEL.removeEventListener("message", handler);
      resolve();
    }, 800);
  });

  await probePromise;

  for (const j of recent) {
    if (!aliveIds.has(j.id)) {
      // No tab claimed this job — it was abandoned by a crashed/closed tab.
      await idbPut("jobs", {
        ...j,
        status: "failed",
        error: "Interrupted — the app reloaded mid-job.",
        updatedAt: Date.now(),
      });
    }
  }
}

/* ────────────────────────────────────────────────────────────
   Terminal job reaping — keeps the job tray clean.
   
   Jobs that reached a terminal state (done/failed) more than
   REAP_AFTER_MS ago are deleted from IndexedDB. This prevents the
   job tray from filling with ancient history and confusing users
   who see "processing" badges on jobs that finished long ago.
   Runs on boot and every 5 minutes while the app is open.
   ──────────────────────────────────────────────────────────── */
let reaperStarted = false;

export async function reapTerminalJobs(): Promise<void> {
  try {
    const rows = await idbAll<AnalysisJob>("jobs");
    const now = Date.now();
    const doomed: string[] = [];
    for (const j of rows) {
      if (j.status === "done" || j.status === "failed") {
        if (now - j.updatedAt > REAP_AFTER_MS) doomed.push(j.id);
      }
    }
    if (doomed.length > 0) {
      for (const id of doomed) await idbDelete("jobs", id);
      bump("jobs");
    }
  } catch {
    /* reaping is best-effort */
  }
}

/** Start a periodic reaper that cleans up terminal jobs. Called once
 *  on boot; idempotent. */
export function startJobReaper(): void {
  if (reaperStarted) return;
  reaperStarted = true;
  // Initial reap shortly after boot (gives the app time to settle).
  setTimeout(() => void reapTerminalJobs(), 10_000);
  // Then every 5 minutes.
  setInterval(() => void reapTerminalJobs(), 5 * 60 * 1000);
}

export function enqueueJob<R>(spec: JobSpec<R>): {
  id: string;
  row: AnalysisJob;
} {
  const row: AnalysisJob = {
    id: uid("job"),
    documentId: spec.documentId ?? "",
    userId: getUserId(),
    status: "queued",
    step: "Queued",
    progress: 0,
    etaSec: null,
    results: null,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    label: spec.label,
    bot: spec.bot,
    words: 0,
  };
  const controller = new AbortController();
  const signal = controller.signal;
  controllers.set(row.id, controller);

  void idbPut("jobs", row).then(() => bump("jobs"));

  const start = async (): Promise<void> => {
    // If cancelled while queued, the IndexedDB row was already flipped to
    // "failed" by cancelJob — bail before touching state so we don't revive it.
    if (signal.aborted) {
      controllers.delete(row.id);
      return;
    }
    const startedAt = performance.now();
    let lastPersist = 0;
    let lastSampleAt = 0;
    const samples: { elapsed: number; progress: number }[] = [];
    const state: AnalysisJob = { ...row, status: "running" };
    activeJobIds.add(row.id); // register for cross-tab liveness probes
    await idbPut("jobs", state);
    bump("jobs");

    const report = (r: JobReport): void => {
      const stepIdx = Math.min(r.step, spec.steps.length - 1);
      const progress = Math.min(
        99,
        Math.round(
          ((stepIdx + Math.min(1, r.fraction)) / spec.steps.length) * 100,
        ),
      );
      const elapsed = (performance.now() - startedAt) / 1000;

      // Smoothed ETA: rolling window of (elapsed, progress) samples.
      // Sampling is throttled to ~2 Hz so the window spans meaningful time,
      // not three adjacent micro-ticks that all fire within the same token.
      const now = performance.now();
      if (now - lastSampleAt > 480) {
        lastSampleAt = now;
        samples.push({ elapsed, progress });
        while (samples.length > ETA_WINDOW) samples.shift();
      }
      let etaSec: number | null = null;
      if (samples.length >= 2) {
        const first = samples[0];
        const last = samples[samples.length - 1];
        if (first && last) {
          const dProgress = last.progress - first.progress;
          const dElapsed = last.elapsed - first.elapsed;
          if (dElapsed > 0 && dProgress > 0) {
            const rate = dProgress / dElapsed; // progress points / second
            etaSec = Math.max(1, Math.round((100 - progress) / rate));
          }
        }
      }
      // Early single-point fallback so the ETA shows before the window fills.
      if (etaSec === null && progress > 4) {
        etaSec = Math.max(
          1,
          Math.round((elapsed / (progress / 100)) * (1 - progress / 100)),
        );
      }

      state.step = spec.steps[stepIdx] ?? state.step;
      state.progress = progress;
      state.etaSec = etaSec;
      state.words = r.words ?? state.words;
      if (state.words && state.words > 0 && elapsed > 0.5) {
        state.wordsPerMinute = Math.round((state.words / elapsed) * 60);
      }
      state.updatedAt = Date.now();
      // throttle persistence to ~3Hz; final state always persists
      if (now - lastPersist > 320) {
        lastPersist = now;
        void idbPut("jobs", { ...state }).then(() => bump("jobs"));
      }
    };

    try {
      const result = await withRetry(
        () => spec.run(report, signal),
        spec.retries ?? 1,
        (n) => {
          state.step = `Retrying (attempt ${n + 1})…`;
          state.updatedAt = Date.now();
          void idbPut("jobs", { ...state }).then(() => bump("jobs"));
        },
        signal,
      );
      state.status = "done";
      state.progress = 100;
      state.step = "Complete";
      state.etaSec = null;
      state.updatedAt = Date.now();
      await idbPut("jobs", { ...state });
      bump("jobs");
      if (spec.onDone) await spec.onDone(result, { ...state });
    } catch (e) {
      const cancelled =
        signal.aborted || (e instanceof Error && /abort/i.test(e.message));
      state.status = "failed";
      state.error = cancelled
        ? "Cancelled by user."
        : e instanceof Error
          ? e.message
          : "Job failed.";
      state.updatedAt = Date.now();
      await idbPut("jobs", { ...state });
      bump("jobs");
      if (spec.onError)
        await spec.onError(e instanceof Error ? e : new Error("Job failed."), {
          ...state,
        });
      // failures are surfaced via the persisted row + onError; the queue itself keeps pumping
    } finally {
      controllers.delete(row.id);
      activeJobIds.delete(row.id); // unregister from cross-tab liveness probes
    }
  };

  enqueueEntry(spec, () => start().catch(() => undefined));
  pump();
  return { id: row.id, row };
}

/**
 * Cancel a queued or running job. Aborts the AbortController passed to
 * `spec.run` and marks the persisted row as "failed" with the message
 * "Cancelled by user.". Returns `true` if a controller was found and
 * signalled, `false` if the job already finished or never existed.
 *
 * If the underlying `spec.run` doesn't consult the signal (older callers),
 * the abort still flips the persisted row so the UI reflects the cancel —
 * the in-flight fetch will simply complete and its result discarded.
 */
export function cancelJob(id: string): boolean {
  const controller = controllers.get(id);
  if (!controller) return false;
  controller.abort();
  controllers.delete(id);
  // Best-effort row flip — works whether the job was still queued or
  // mid-flight. If the row is already terminal, leave it untouched.
  void (async () => {
    try {
      const rows = await idbAll<AnalysisJob>("jobs");
      const j = rows.find((r) => r.id === id);
      if (j && (j.status === "running" || j.status === "queued")) {
        await idbPut("jobs", {
          ...j,
          status: "failed",
          error: "Cancelled by user.",
          updatedAt: Date.now(),
        });
        bump("jobs");
      }
    } catch {
      /* nothing to do */
    }
  })();
  return true;
}

export function queueDepth(): number {
  return queue.length + active;
}

export interface QueueStats {
  active: number;
  queued: number;
  done: number;
  failed: number;
  total: number;
}

/** Reads the full job picture — live active/queued counters (in-memory)
 *  plus the persisted terminal counts from IndexedDB. Useful for the header
 *  tray badge and observability dashboards. */
export async function queueStats(): Promise<QueueStats> {
  const rows = await idbAll<AnalysisJob>("jobs");
  let done = 0;
  let failed = 0;
  for (const r of rows) {
    if (r.status === "done") done++;
    else if (r.status === "failed") failed++;
  }
  return { active, queued: queue.length, done, failed, total: rows.length };
}
