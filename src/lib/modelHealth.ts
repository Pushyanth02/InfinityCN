/**
 * Adaptive model health — a feedback loop on top of the static family ranking.
 *
 * The usage ledger (`usage` store) records status and latency for every AI
 * call. This module folds those observations into per-model EWMAs
 * (exponentially weighted moving averages) so the fallback chain can prefer
 * models that have actually been succeeding *quickly* for this user lately —
 * and demote models that have been erroring or stalling, even when their
 * family name looks prestigious.
 *
 * Design constraints honored from the parent architecture:
 *   - purely additive to `rankFreeModels` ordering (health acts as a bounded
 *     boost/penalty, never a replacement for the free-only safety filter)
 *   - bounded memory (≤ MAX_MODELS entries), deterministic tie-breaks
 *   - ledger warm-up runs at most once per hour, never blocking a request
 *     chain (best-effort, silent on IndexedDB failure)
 */

import type { BotId, UsageRow } from "./types";
import { getUserId, idbAll } from "./db";

interface Health {
  /** EWMA of success indicator (1 = ok, 0 = error). */
  ok: number;
  /** EWMA of latency among successful calls, ms. Null until first ok. */
  ms: number | null;
  samples: number;
  updatedAt: number;
}

const state = new Map<string, Health>();
let warmedAt = 0;

const ALPHA_OK = 0.25;
const ALPHA_MS = 0.2;
/** Entries above this many are evicted oldest-first (bounded memory). */
const MAX_MODELS = 64;
/** Ledger warm-up cadence. */
const WARM_EVERY_MS = 3_600_000;
/** Observations older than this are ignored during warm-up. */
const RECENT_MS = 7 * 24 * 3_600_000;

const keyOf = (bot: BotId, model: string): string => `${bot}:${model}`;

function fold(h: Health, ok: boolean, latencyMs: number): Health {
  return {
    ok: h.ok + ALPHA_OK * ((ok ? 1 : 0) - h.ok),
    ms:
      ok && latencyMs > 0
        ? h.ms === null
          ? latencyMs
          : h.ms + ALPHA_MS * (latencyMs - h.ms)
        : h.ms,
    samples: Math.min(h.samples + 1, 10_000),
    updatedAt: Date.now(),
  };
}

function evictOldest(): void {
  while (state.size > MAX_MODELS) {
    let oldestKey = "";
    let oldestAt = Infinity;
    for (const [k, h] of state) {
      if (h.updatedAt < oldestAt) {
        oldestAt = h.updatedAt;
        oldestKey = k;
      }
    }
    if (!oldestKey) break;
    state.delete(oldestKey);
  }
}

/** Record one observed outcome. Call alongside every usage log where the
 *  attempted model is known. Cheap: O(1), no I/O. */
export function observeModel(
  bot: BotId,
  model: string,
  ok: boolean,
  latencyMs: number,
): void {
  if (!model) return;
  const k = keyOf(bot, model);
  const prev =
    state.get(k) ?? { ok: 0.7, ms: null as number | null, samples: 0, updatedAt: 0 };
  const next = fold(prev, ok, latencyMs);
  state.set(k, next);
  evictOldest();
}

/**
 * Additive score for chain reordering. Healthy-and-fast models earn up to
 * +60; models observed failing trend down toward −90. Models with no data
 * score 0 — static ranking fully decides, exactly like today.
 */
export function healthBoost(bot: BotId, model: string): number {
  const h = state.get(keyOf(bot, model));
  if (!h || h.samples < 2) return 0;
  // Success component: neutral at ok≈0.7, spans roughly [−120, +40] before clamping.
  let s = (h.ok - 0.7) * 200;
  // Latency component: rewards genuinely fast successes, penalizes stalls.
  if (h.ms !== null) {
    if (h.ms < 4_000) s += 20;
    else if (h.ms > 30_000) s -= 20;
  }
  return Math.max(-90, Math.min(60, s));
}

/** Rebuild EWMAs from the persisted usage ledger (chronological fold).
 *  Best-effort: any storage error leaves in-memory state untouched. */
export async function warmModelHealth(): Promise<void> {
  const now = Date.now();
  if (now - warmedAt < WARM_EVERY_MS) return;
  warmedAt = now;
  try {
    const uid = getUserId();
    const rows = await idbAll<UsageRow>("usage");
    const cutoff = now - RECENT_MS;
    const byKey = new Map<string, UsageRow[]>();
    for (const r of rows) {
      if (r.userId !== uid || r.createdAt < cutoff || !r.model) continue;
      const k = `${r.bot}:${r.model}`;
      const list = byKey.get(k);
      if (list) list.push(r);
      else byKey.set(k, [r]);
    }
    for (const [k, list] of byKey) {
      list.sort((a, b) => a.createdAt - b.createdAt);
      let h: Health = { ok: 0.7, ms: null, samples: 0, updatedAt: 0 };
      for (const r of list) h = fold(h, r.status === "ok", r.latencyMs);
      state.set(k, h);
    }
    evictOldest();
  } catch {
    /* ledger unavailable — static ranking still works */
  }
}

/** Test hook: reset all observations. */
export function resetModelHealth(): void {
  state.clear();
  warmedAt = 0;
}
