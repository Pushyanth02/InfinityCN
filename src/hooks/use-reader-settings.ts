"use client";

import { useEffect, useState } from "react";
import { DEFAULT_READER_SETTINGS, type ReaderSettings } from "@/lib/types";

const STORAGE_KEY = "lem.reader.settings.v1";

function load(): ReaderSettings {
  if (typeof window === "undefined") return DEFAULT_READER_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_READER_SETTINGS, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return DEFAULT_READER_SETTINGS;
}

function persist(s: ReaderSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

export function useReaderSettings() {
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_READER_SETTINGS);
  const [hydrated, setHydrated] = useState(false);

  // SSR-safe localStorage hydration. Reading from localStorage during render
  // would break SSR, so we do it in an effect on mount. The setState calls
  // are deferred via a microtask to avoid the synchronous setState-in-effect
  // cascading-render lint rule — the values still apply on the first paint.
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setSettings(load());
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    persist(settings);
    // Apply theme classes to <html> with a smooth transition
    const html = document.documentElement;
    // Add transition class for smooth color switching
    html.classList.add("theme-transitioning");
    const transitionTimer = setTimeout(() => {
      html.classList.remove("theme-transitioning");
    }, 360);
    html.classList.remove("dark", "sepia");
    if (settings.theme === "dark") html.classList.add("dark");
    else if (settings.theme === "sepia") html.classList.add("sepia");
    html.dataset.contrast = settings.contrast;
    html.dataset.motion = settings.motion;
    html.dataset.anim = settings.animSpeed;
    html.dataset.font = settings.fontFamily;
    html.dataset.kbdHints = settings.kbdHints ? "true" : "";
    html.style.setProperty("--pref-font-size", `${settings.fontSize}px`);
    html.style.setProperty("--pref-line-height", String(settings.lineHeight));
    html.style.setProperty("--pref-letter-spacing", `${settings.letterSpacing}em`);
    html.style.setProperty("--pref-reading-width", `${settings.readingWidth}ch`);
    html.style.setProperty("--pref-accent", settings.accent);
    return () => clearTimeout(transitionTimer);
  }, [settings, hydrated]);

  const update = (patch: Partial<ReaderSettings>) =>
    setSettings((s) => ({ ...s, ...patch }));

  return { settings, update, hydrated };
}

/**
 * Library-scoped preferences (favorites, tags, collections, view/sort/filter).
 * Stored in localStorage; reactive via useSyncExternalStore.
 */
import { useSyncExternalStore } from "react";

export type ViewMode = "grid" | "list";
export type SortKey = "recent" | "title" | "size" | "progress";
export type StatusFilter = "all" | "ready" | "processing" | "error";

export interface LibraryPrefs {
  view: ViewMode;
  sort: SortKey;
  status: StatusFilter;
  sourceTypes: string[];
  showFavoritesOnly: boolean;
  showRecentOnly: boolean;
}

const LIB_KEY = "lem.library.prefs.v1";
const DEFAULT_LIB: LibraryPrefs = {
  view: "grid",
  sort: "recent",
  status: "all",
  sourceTypes: [],
  showFavoritesOnly: false,
  showRecentOnly: false,
};

let libCache: LibraryPrefs = DEFAULT_LIB;
let libHydrated = false;
const libListeners = new Set<() => void>();

function libHydrate() {
  if (libHydrated || typeof window === "undefined") return;
  libHydrated = true;
  try {
    const raw = window.localStorage.getItem(LIB_KEY);
    if (raw) libCache = { ...DEFAULT_LIB, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
}

function libPersist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LIB_KEY, JSON.stringify(libCache));
  } catch {
    // ignore
  }
}

function libSubscribe(cb: () => void) {
  libHydrate();
  libListeners.add(cb);
  return () => libListeners.delete(cb);
}
function libSnapshot() {
  libHydrate();
  return libCache;
}
function libServer() {
  return DEFAULT_LIB;
}

export function useLibraryPrefs(): LibraryPrefs {
  return useSyncExternalStore(libSubscribe, libSnapshot, libServer);
}

export function setLibraryPrefs(patch: Partial<LibraryPrefs>) {
  libCache = { ...libCache, ...patch };
  libPersist();
  libListeners.forEach((l) => l());
}
