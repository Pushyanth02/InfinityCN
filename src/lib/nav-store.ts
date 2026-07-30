"use client";

import { create } from "zustand";
import type { ViewName } from "@/lib/types";

interface NavState {
  view: ViewName;
  /** For the reader view — which document is open. */
  activeDocumentId: string | null;
  /** Optional return target after finishing a flow (e.g. reader → library). */
  returnTo: ViewName | null;
  /** Lightweight history stack so browser back button isn't needed. */
  history: ViewName[];
  go: (view: ViewName, opts?: { documentId?: string; returnTo?: ViewName }) => void;
  back: () => void;
  reset: () => void;
}

export const useNav = create<NavState>((set, get) => ({
  view: "landing",
  activeDocumentId: null,
  returnTo: null,
  history: [],
  go: (view, opts) =>
    set((s) => ({
      view,
      history: [...s.history, s.view].slice(-12),
      activeDocumentId: opts?.documentId ?? (view === "reader" ? s.activeDocumentId : null),
      returnTo: opts?.returnTo ?? null,
    })),
  back: () => {
    const h = get().history;
    if (h.length === 0) {
      set({ view: "dashboard" });
      return;
    }
    const prev = h[h.length - 1];
    set({ view: prev, history: h.slice(0, -1) });
  },
  reset: () =>
    set({ view: "landing", activeDocumentId: null, returnTo: null, history: [] }),
}));
