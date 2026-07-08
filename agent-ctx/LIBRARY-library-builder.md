# LIBRARY — Library Builder

**Task ID:** LIBRARY
**Agent:** Library Builder
**Task:** Build the premium library view at `src/components/lemniscate/views/library.tsx`

## Context consumed
- `worklog.md` — project overview (deterministic classical-NLP doc-to-story platform, Velvet Noir theme, embedded poller, sample endpoint `POST /api/sample?mode=BOTH`).
- `src/app/globals.css` — design tokens (deep midnight + warm ivory + golden amber + slate + burgundy + plum), `.text-headline`, `.text-title`, `.surface-raised`, `.glass`, `.glass-strong`, `.text-amber-gradient`, `.divider-gold`, `.shadow-cinema`, `.shadow-glow-amber`, `.scrollbar-lemniscate`, `.shimmer-text`, `.pulse-amber`, `.breathe`, semantic color vars.
- `src/lib/motion.ts` — variants: `pageTransition`, `staggerContainer`, `staggerFast`, `revealUp`, `revealFade`, `revealScale`, `revealBlur`, `hoverLift`, `hoverScale`, `hoverGlow`, `spring` presets (snappy/gentle/slow/default).
- `src/components/lemniscate/store.ts` — `useLemniscate` with `openReader(narrativeId, mode, documentId?)`, `openProcessing(jobId, documentId)`, `openLanding()`, `uploadMode` (`'ORIGINAL' | 'CINEMATIFIED' | 'BOTH'`), `setUploadMode`, `progress` map.
- `src/components/lemniscate/logo.tsx` — `InfinityMark`, `InfinityFlow`, `InfinityHero`, `Flourish`.
- `src/components/lemniscate/use-realtime.ts` — `useRealtime(jobIds: string[])` returns `{ connected, logs }`, patches progress into the store via `patchProgress`.
- `src/components/lemniscate/document-library.tsx` (legacy) — reference for data shape, stage labels, file-type icon mapping, openReader flow (fetch `/api/documents/{id}/narratives` → pick CINEMATIFIED else ORIGINAL → `openReader`).
- `src/components/lemniscate/upload-panel.tsx` (legacy) — reference for upload flow (FormData → `/api/documents/upload` → `openProcessing`), mode tabs, drag-drop zone pattern.
- API routes:
  - `GET /api/documents` → `{ documents: [...] }` (id, originalName, mimeType, sizeBytes, status, createdAt, fileHash, `_count: { jobs, narratives }`, `jobs: [{ id, mode, status, progress, stage }]`).
  - `GET /api/stats` → `{ counts: { documents, jobs, narratives, scenes, characters, events, peaks }, byStatus, byJobStatus, byMode, recentJobs }`.
  - `POST /api/documents/upload` (FormData: file + mode) → `{ documentId, jobId, mode, status, message }`.
  - `POST /api/sample?mode=...` → `{ documentId, jobId, mode, status, sampleTitle, message }`.
  - `GET /api/documents/{id}/narratives` → `{ narratives: [{ id, mode, ... }] }`.
  - `DELETE /api/documents/{id}` → `{ ok: true }`.

## Plan
- Single `'use client'` file exporting `LibraryView`.
- Sections: Header (title + Upload/Sample buttons), collapsible UploadZone (mode tabs + drag-drop + file-type icons), StatsStrip (Documents/Narratives/Scenes/Characters), FilterBar (pills + search + sort), DocumentGrid (book cards with deterministic cover gradients), EmptyState (InfinityFlow + CTAs).
- Polling: 5s interval, only set loading on initial load.
- Realtime: `useRealtime(activeJobIds)` for live progress on processing jobs.
- Cover gradient: deterministic from fileHash — pick from 8 curated palette pairs (amber/burgundy/plum/teal/climax/gold/slate), hash-derived angle, layered radial accent, infinity watermark.
- Animation: `staggerContainer` + `revealScale` on grid, `hoverLift` + `hoverGlow` on cards, `AnimatePresence` + `layout` for filter transitions, `spring.snappy` on progress bar width.
