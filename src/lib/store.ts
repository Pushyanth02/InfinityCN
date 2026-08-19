import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { Prefs, ReaderSettings, View, BotId } from "./types";
import { uid } from "./utils";

const PREFS_KEY = "lemniscate:prefs";

export const defaultReader: ReaderSettings = {
  fontFamily: "literata",
  fontSize: 18,
  lineHeight: 1.7,
  letterSpacing: 0,
  width: 68,
  theme: "dark",
  focusMode: false,
  accent: "gold",
  contrast: "normal",
  motion: true,
  animSpeed: 1,
  kbdHints: true,
};

export const defaultPrefs: Prefs = {
  reader: defaultReader,
  accent: "gold",
  maxUploadMB: 25,
  aiModels: {},
  dailyQuota: 120,
  ring: "normal",
  seeded: false,
  aiRefine: true,
  profile: { name: "", color: "gold" },
};

const VALID_READER_FONTS = new Set<string>([
  "literata", "garamond", "spectral", "sourceserif", "georgia", "bookerly", "baskerville", "palatino",
]);

/** Known paid model slugs that users may have saved from an earlier version
 *  of the app. Each maps to its free-tier equivalent. This migration runs
 *  on every prefs load so stored paid models are transparently converted. */
const PAID_TO_FREE: Record<string, string> = {
  "qwen/qwen-2.5-7b-instruct": "qwen/qwen-2.5-7b-instruct:free",
  "meta-llama/llama-3.3-70b-instruct": "meta-llama/llama-3.3-70b-instruct:free",
  "meta-llama/llama-3.1-8b-instruct": "meta-llama/llama-3.1-8b-instruct:free",
  "mistralai/mistral-7b-instruct": "mistralai/mistral-7b-instruct:free",
  "openai/gpt-4o-mini": "openai/gpt-4o-mini:free",
  "anthropic/claude-3-haiku": "meta-llama/llama-3.3-70b-instruct:free", // deprecated → free fallback
};

function migrateToFree(aiModels: Partial<Record<BotId, string>>): Partial<Record<BotId, string>> {
  const out: Partial<Record<BotId, string>> = {};
  for (const [bot, id] of Object.entries(aiModels)) {
    if (!id || typeof id !== "string") continue;
    // Router presets (meridian/*, openrouter/auto) pass through unchanged.
    if (id.startsWith("meridian/") || id === "openrouter/auto") { out[bot as BotId] = id; continue; }
    // Already free — pass through.
    if (id.endsWith(":free")) { out[bot as BotId] = id; continue; }
    // Known paid slug → free variant.
    if (PAID_TO_FREE[id]) { out[bot as BotId] = PAID_TO_FREE[id]; continue; }
    // Unknown paid model → append :free (OpenRouter convention).
    out[bot as BotId] = id.includes(":") ? id.replace(/:.*$/, ":free") : `${id}:free`;
  }
  return out;
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Prefs>;
      const merged: Prefs = {
        ...defaultPrefs,
        ...p,
        reader: { ...defaultReader, ...(p.reader ?? {}) },
        profile: { ...defaultPrefs.profile, ...(p.profile ?? {}) },
      };
      // migrate readers whose saved face was retired (Verdana / Open Sans)
      if (!VALID_READER_FONTS.has(merged.reader.fontFamily)) {
        merged.reader.fontFamily = "literata";
      }
      // migrate any paid model IDs to their free-tier equivalents
      if (merged.aiModels) {
        merged.aiModels = migrateToFree(merged.aiModels);
      }
      return merged;
    }
  } catch { /* corrupted prefs fall back to defaults */ }
  return defaultPrefs;
}

function persist(prefs: Prefs): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* storage full — non-fatal */ }
}

interface PrefsState {
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
  setReader: (patch: Partial<ReaderSettings>) => void;
  resetPrefs: () => void;
}

export const usePrefs = create<PrefsState>((set) => ({
  prefs: loadPrefs(),
  setPrefs: (patch) =>
    set((s) => {
      const prefs = { ...s.prefs, ...patch };
      persist(prefs);
      return { prefs };
    }),
  setReader: (patch) =>
    set((s) => {
      const prefs = { ...s.prefs, reader: { ...s.prefs.reader, ...patch } };
      persist(prefs);
      return { prefs };
    }),
  resetPrefs: () =>
    set(() => {
      persist(defaultPrefs);
      return { prefs: defaultPrefs };
    }),
}));

/** Selective accessor: subscribe to the entire prefs object.
 *  Use `usePrefs(s => s.prefs.X)` for single-field subscriptions to avoid
 *  re-rendering on unrelated prefs changes. */
export function getPrefs(): Prefs {
  return usePrefs.getState().prefs;
}

/* ---------------- navigation ---------------- */

interface NavEntry { view: View; docId: string | null }

interface NavState {
  view: View;
  docId: string | null;
  sub: string | null;
  stack: NavEntry[];
  /** A file selected on the Landing page, handed off to the Upload view
   *  for immediate processing. Cleared once the Upload view consumes it. */
  pendingFile: File | null;
  go: (view: View, opts?: { docId?: string | null; sub?: string | null }) => void;
  openDoc: (id: string) => void;
  back: () => void;
  setPendingFile: (file: File | null) => void;
}

export const useNav = create<NavState>((set, get) => ({
  view: "landing",
  docId: null,
  sub: null,
  stack: [],
  pendingFile: null,
  go: (view, opts) =>
    set((s) => ({
      stack: [...s.stack.slice(-24), { view: s.view, docId: s.docId }],
      view,
      docId: opts?.docId !== undefined ? opts.docId : view === "reader" ? s.docId : null,
      sub: opts?.sub ?? null,
    })),
  openDoc: (id) => get().go("reader", { docId: id }),
  back: () =>
    set((s) => {
      const prev = s.stack[s.stack.length - 1];
      return prev
        ? { stack: s.stack.slice(0, -1), view: prev.view, docId: prev.docId, sub: null }
        : { stack: [], view: "dashboard", docId: null, sub: null };
    }),
  setPendingFile: (file) => set({ pendingFile: file }),
}));

/* ---------------- toasts ---------------- */

export interface ToastItem {
  id: string;
  kind: "success" | "error" | "info";
  msg: string;
}

interface ToastState {
  list: ToastItem[];
  push: (kind: ToastItem["kind"], msg: string) => void;
  dismiss: (id: string) => void;
}

export const useToasts = create<ToastState>((set, get) => ({
  list: [],
  push: (kind, msg) => {
    const id = uid("toast");
    set((s) => ({ list: [...s.list.slice(-3), { id, kind, msg }] }));
    setTimeout(() => get().dismiss(id), 4200);
  },
  dismiss: (id) => set((s) => ({ list: s.list.filter((t) => t.id !== id) })),
}));

export const toast = (kind: ToastItem["kind"], msg: string): void => useToasts.getState().push(kind, msg);

// Re-export useShallow for components that need multi-field subscriptions
// without re-rendering on every store change.
export { useShallow };
