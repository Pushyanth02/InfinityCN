'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type View =
  | 'landing'
  | 'library'
  | 'processing'
  | 'reader'
  | 'characters'
  | 'scenes'
  | 'settings'

export type ReaderMode = 'ORIGINAL' | 'CINEMATIFIED'
export type Theme = 'dark' | 'light'
export type FontSize = 'sm' | 'md' | 'lg' | 'xl'
export type LineHeight = 'compact' | 'normal' | 'relaxed'
export type FontFamily = 'serif' | 'sans'
export type ReaderWidth = 'narrow' | 'medium' | 'wide'

/** Reader preferences that persist across sessions (localStorage). */
interface ReaderPreferences {
  readerFontSize: FontSize
  readerTheme: Theme
  readerLineHeight: LineHeight
  readerFontFamily: FontFamily
  readerWidth: ReaderWidth
  reducedMotion: boolean
  /** Whether the reader's explorer sidebar is collapsed (maximizes reading width). */
  readerSidebarCollapsed: boolean
}

const DEFAULT_PREFERENCES: ReaderPreferences = {
  readerFontSize: 'md',
  readerTheme: 'dark',
  readerLineHeight: 'normal',
  readerFontFamily: 'serif',
  readerWidth: 'medium',
  reducedMotion: false,
  readerSidebarCollapsed: false,
}

interface LemniscateState extends ReaderPreferences {
  view: View
  activeJobId: string | null
  activeDocumentId: string | null
  activeNarrativeId: string | null
  activeMode: ReaderMode | null
  /** Desired reading mode for dual-mode switching. The reader resolves this
   *  to whichever sibling narrative exists on the active document. */
  desiredMode: ReaderMode | null
  setDesiredMode: (m: ReaderMode) => void
  readerImmersive: boolean

  // upload
  uploadMode: ReaderMode | 'BOTH'
  setUploadMode: (m: ReaderMode | 'BOTH') => void

  // realtime progress
  progress: Record<string, { progress: number; stage: string; message?: string; status?: string }>

  // navigation
  setView: (v: View) => void
  openProcessing: (jobId: string, documentId: string) => void
  openReader: (narrativeId: string, mode: ReaderMode, documentId?: string) => void
  openCharacters: (narrativeId: string, documentId?: string) => void
  openScenes: (narrativeId: string, documentId?: string) => void
  openLibrary: () => void
  openLanding: () => void
  openSettings: () => void

  // reader prefs
  setReaderFontSize: (s: FontSize) => void
  setReaderTheme: (t: Theme) => void
  setReaderLineHeight: (l: LineHeight) => void
  setReaderFontFamily: (f: FontFamily) => void
  setReaderWidth: (w: ReaderWidth) => void
  setReducedMotion: (v: boolean) => void
  toggleReaderImmersive: () => void
  toggleReaderSidebar: () => void
  setReaderSidebarCollapsed: (v: boolean) => void

  // progress
  patchProgress: (jobId: string, patch: Partial<{ progress: number; stage: string; message: string; status: string }>) => void
  clearProgress: (jobId: string) => void
}

export const useLemniscate = create<LemniscateState>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFERENCES,
      view: 'landing',
      activeJobId: null,
      activeDocumentId: null,
      activeNarrativeId: null,
      activeMode: null,
      desiredMode: null,
      readerImmersive: false,
      uploadMode: 'BOTH',
      setUploadMode: (m) => set({ uploadMode: m }),
      progress: {},
      setView: (v) => set({ view: v }),
      openProcessing: (jobId, documentId) =>
        set({ view: 'processing', activeJobId: jobId, activeDocumentId: documentId }),
      openReader: (narrativeId, mode, documentId) =>
        set({ view: 'reader', activeNarrativeId: narrativeId, activeMode: mode, desiredMode: mode, activeDocumentId: documentId ?? null }),
      setDesiredMode: (m) => set({ desiredMode: m }),
      openCharacters: (narrativeId, documentId) =>
        set({ view: 'characters', activeNarrativeId: narrativeId, activeDocumentId: documentId ?? null }),
      openScenes: (narrativeId, documentId) =>
        set({ view: 'scenes', activeNarrativeId: narrativeId, activeDocumentId: documentId ?? null }),
      openLibrary: () =>
        set({ view: 'library', activeJobId: null, activeNarrativeId: null }),
      openLanding: () =>
        set({ view: 'landing', activeJobId: null, activeNarrativeId: null }),
      openSettings: () => set({ view: 'settings' }),
      setReaderFontSize: (s) => set({ readerFontSize: s }),
      setReaderTheme: (t) => set({ readerTheme: t }),
      setReaderLineHeight: (l) => set({ readerLineHeight: l }),
      setReaderFontFamily: (f) => set({ readerFontFamily: f }),
      setReaderWidth: (w) => set({ readerWidth: w }),
      setReducedMotion: (v) => set({ reducedMotion: v }),
      toggleReaderImmersive: () => set((s) => ({ readerImmersive: !s.readerImmersive })),
      toggleReaderSidebar: () =>
        set((s) => ({ readerSidebarCollapsed: !s.readerSidebarCollapsed })),
      setReaderSidebarCollapsed: (v) => set({ readerSidebarCollapsed: v }),
      patchProgress: (jobId, patch) =>
        set((s) => ({
          progress: { ...s.progress, [jobId]: { ...s.progress[jobId], ...patch } },
        })),
      clearProgress: (jobId) =>
        set((s) => {
          const next = { ...s.progress }
          delete next[jobId]
          return { progress: next }
        }),
    }),
    {
      name: 'lemniscate-reader-prefs',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // Only persist durable reader preferences — never transient navigation
      // or in-flight job progress state.
      partialize: (s): ReaderPreferences => ({
        readerFontSize: s.readerFontSize,
        readerTheme: s.readerTheme,
        readerLineHeight: s.readerLineHeight,
        readerFontFamily: s.readerFontFamily,
        readerWidth: s.readerWidth,
        reducedMotion: s.reducedMotion,
        readerSidebarCollapsed: s.readerSidebarCollapsed,
      }),
    },
  ),
)
