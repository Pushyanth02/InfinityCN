# READER-ENHANCE — Reader Enhancer

**Task ID:** READER-ENHANCE
**Agent:** Reader Enhancer
**Task:** Add export, search, progress tracking, and bookmarks to the reader

## Context consumed
- `worklog.md` — full project history (Velvet Noir palette, Phase 4 premium UX redesign with reader at 1,601 lines, Phase 5 perf/responsive work).
- `src/components/lemniscate/views/reader.tsx` — existing reader with EmptyState/LoadingState/ErrorState/TopProgressBar/TopBar/ParagraphBlock/OriginalReader/SceneCinematic/CinematifiedReader/ReaderSidebar/BottomNav/ReaderView. Spring-smoothed scroll progress, immersive mode with controls auto-hide, theme sync via next-themes.
- `src/components/lemniscate/store.ts` — `useLemniscate` with `activeNarrativeId`, `activeMode`, `readerFontSize`, `readerTheme`, `readerImmersive`, navigation actions.
- `src/lib/motion.ts` — `spring` presets (default/snappy/gentle/bouncy/slow), `bookOpen`/`sceneTransition`/`revealBlur`/`staggerContainer`/`staggerFast`/`hoverLift` variants.
- `src/app/api/narratives/[id]/export/route.ts` — supports markdown/pdf/epub. PDF returns printable HTML (browser prints to PDF). EPUB is a stored-zip with mimetype/container.xml/content.opf/toc.ncx/chapter.xhtml.
- `src/app/api/narratives/[id]/progress/route.ts` — GET returns `{ progress: { scrollPct, sceneIndex, paragraphIdx } | null }`. POST upserts with same body (scrollPct clamped 0–100).
- `src/app/api/narratives/[id]/bookmarks/route.ts` — GET list, POST create (`{ sceneIndex?, paragraphIdx?, offset, label?, note? }`), DELETE by `?bookmarkId=`. Orders by offset asc.
- `src/app/api/narratives/[id]/search/route.ts` — `?q=` (≥2 chars). Returns `{ results: [{ type: 'paragraph'|'scene'|'character', refId, title, snippet, matchCount }], total }`. Snippets are context-windowed (40 chars before, 60 after) with `…` prefix/suffix. Limited to 50.
- `src/app/globals.css` — design tokens (midnight/ivory/amber/slate/burgundy/plum/tension/calm/climax), `.scrollbar-lemniscate`, `.reader-canvas`, `.glass-strong`, `.divider-gold`. Added `.reader-flash-highlight` keyframe for search-jump flash.
- `agent-ctx/READER-reader-builder.md` — previous agent's notes on the reader architecture. Scene DB schema lacks `heading`/`dominantEmotion` columns so the reader rebuilds heading from `location`+`timeOfDay`+matched `Location.type`.

## File produced
`src/components/lemniscate/views/reader.tsx` — `'use client'`, exports `ReaderView`. Grew from 1,601 → 2,789 lines. 4 new components, 3 new types, 2 new helpers, 4 new feature areas wired into ReaderView.

## Architecture additions

### Types
- `ReaderBookmark` — `{ id, narrativeId, sceneIndex: number|null, paragraphIdx: number|null, offset, label: string|null, note: string|null, createdAt }`.
- `ReaderProgress` — `{ scrollPct, sceneIndex, paragraphIdx }`.
- `ReaderSearchResult` — `{ type: 'paragraph'|'scene'|'character', refId, title, snippet, matchCount }`.

### Helpers
- `useDebouncedValue<T>(value, delay)` — setTimeout-based debounce. Used by search input (300ms).
- `HighlightMatch({ text, query })` — wraps query matches in `<mark class="bg-amber/25 text-amber">`. Used in search result snippets.

### New components

1. **ExportMenu** (`ExportMenuProps: { narrativeId, onClose }`) — Notion-style dropdown.
   - 3 options: Markdown (FileText, ".md — Plain text"), Printable (FileDown, ".html — print to PDF"), EPUB (BookOpen, ".epub — E-reader").
   - Each option calls `window.open('/api/narratives/${narrativeId}/export?format=${format}', '_blank', 'noopener,noreferrer')` then `onClose()`.
   - Motion: spring.snappy, scale 0.95→1, y -8→0, opacity.
   - Header with "Export" label + X close button. Footer "Generated deterministically · offline".
   - Hover state: amber/10 background, amber icon color, Download icon appears on right.

2. **BookmarksPopover** (`BookmarksPopoverProps: { bookmarks, onJump, onDelete, onClose }`) — dropdown list.
   - Header "Bookmarks · N" + X close.
   - Empty state: centered Bookmark icon + instructional text.
   - List items: Bookmark icon, label (truncated), percent + scene badge, click-to-jump button, hover-reveal Trash2 delete button.
   - Max-h-80 scrollable with scrollbar-lemniscate.

3. **SearchOverlay** (`SearchOverlayProps: { narrativeId, onClose, onJumpParagraph, onJumpScene }`) — Linear-style command palette.
   - Full-screen backdrop: midnight/80 + backdrop-blur-md. Click closes.
   - Centered panel at 10vh: max-w-2xl, plum/95 + backdrop-blur-2xl, rounded-2xl, border-amber/20, shadow-cinema.
   - Input row: Search icon, auto-focused input (60ms delay), ESC kbd or Loader2 spinner (when loading).
   - Body scroll locked via `document.body.style.overflow = 'hidden'`.
   - Debounced search (300ms) with AbortController. Skips if query < 2 chars.
   - Results grouped by type: Paragraphs (FileText), Scenes (Film), Characters (Users). Each group shows count.
   - Each result: title + match-count badge (×N if >1) + 2-line italic snippet with HighlightMatch.
   - Empty state (< 2 chars): Search icon + "Type at least 2 characters to search".
   - No-results state: "No results for ..." with amber-highlighted query.
   - Partial-results footer: "Showing N of M matches — refine your query".
   - Result click → onClose + 220ms delay → onJumpParagraph/onJumpScene.
   - Footer: "Click/Tap result to jump" + "esc to close".

4. **ContinueReadingHint** (`ContinueReadingHintProps: { progress, onDismiss, onStartOver }`) — bottom-center glass pill.
   - "Resumed at N% · Scene X" with BookOpen icon.
   - "Start over" button (mono uppercase, slate→amber on hover).
   - X dismiss button.
   - Auto-dismisses after 7s via setTimeout.
   - Motion: spring.gentle, y 40→0, opacity.

### TopBar modifications
- 12 new props: `isCurrentBookmarked`, `bookmarkCount`, `narrativeId`, `onOpenSearch`, `onToggleBookmark`, `onOpenBookmarksList`, `onCloseBookmarksList`, `bookmarksListOpen`, `bookmarks`, `onJumpBookmark`, `onDeleteBookmark`.
- Internal state: `exportOpen` (local dropdown).
- Internal refs: `exportRef`, `bookmarksRef` — used by mousedown listener to close popovers on outside click.
- New buttons (between Scenes explorer and Immersive toggle):
  - Vertical divider (hidden on xs) — visually separates explorer buttons from power-user buttons.
  - **Search** (always visible, `aria-keyshortcuts="Meta+K Ctrl+K"`).
  - **Bookmark toggle** — AnimatePresence mode="wait" swaps Bookmark↔BookmarkCheck with spring.bouncy scale animation. Count badge (amber pill, top-right) shows when `bookmarkCount > 0` (capped at "9+"). Amber color when `isCurrentBookmarked`.
  - **Bookmarks list** (BookOpen icon) — opens BookmarksPopover. Wrapper div has `lg:hidden` when `mode === 'CINEMATIFIED' && !immersive` (sidebar takes over on lg+).
  - **Export** (Download icon) — opens ExportMenu. `aria-expanded={exportOpen}`.

### Paragraph / scene data attributes
- `ParagraphBlock` (ORIGINAL mode): wrapping motion.div gets `data-paragraph-id={p.id}` + `data-paragraph-idx={p.index}`.
- `SceneCinematic` (CINEMATIFIED mode): motion.section gets `data-scene-id={scene.id}` (in addition to existing `data-scene-index`). All 6 paragraph-type render branches (DIALOGUE/HEADING/TRANSITION/THOUGHT/ACTION/NARRATION) get `data-paragraph-id` + `data-paragraph-idx`.

### ReaderSidebar modifications
- 3 new props: `bookmarks`, `onJumpBookmark`, `onDeleteBookmark`.
- New "Bookmarks" section after "In This Scene" — header with Bookmark icon + count, empty state, list with jump + delete (max-h-60 scrollable).

### ReaderView wiring
- **New state**: `searchOpen`, `bookmarksListOpen`, `bookmarks`, `savedProgress`, `progressRestored`, `showContinueHint`, `currentParagraphIdx`.
- **New refs**: `restoringRef` (suppresses saves during scroll-restore), `lastSaveRef` (2.5s min-interval gate), `currentSceneIdxRef`/`currentParagraphIdxRef`/`activeModeRef`/`narrativeModeRef` (latest-value tracking without re-creating `saveProgress`).
- **Progress fetch** (useEffect on `[narrativeId]`): GET /progress → sets `savedProgress`.
- **Scroll restore** (useEffect on `[narrative, savedProgress, progressRestored]`): skips if scrollPct <= 0. Sets `restoringRef=true`, waits 2 RAFs, `window.scrollTo` with computed targetY, shows continue hint, releases `restoringRef` after 500ms.
- **saveProgress callback** (deps: `[narrativeId]`): stable. Reads latest values from refs. Computes `scrollPct` from window scroll, finds closest `[data-paragraph-idx]` to viewport-top+25%, POSTs to /progress. 2.5s min interval.
- **Auto-save** (useEffect on `[progressRestored, saveProgress]`): `setInterval(saveProgress, 3000)`. Cleared on unmount.
- **Save on unmount** (useEffect on `[saveProgress]`): cleanup calls `saveProgress(true)` (force).
- **Bookmarks fetch** (`refreshBookmarks` + useEffect on `[refreshBookmarks]`): GET /bookmarks → sets `bookmarks` state.
- **Paragraph tracking** (useEffect on `[narrative]`): passive scroll listener schedules RAF to find closest paragraph, updates `currentParagraphIdx`.
- **isCurrentBookmarked memo**: CINEMATIFIED → `bookmarks.some(bm => bm.sceneIndex === currentSceneIdx)`; ORIGINAL → `bookmarks.some(bm => Math.abs(bm.offset - progress*100) < 3)`.
- **onToggleBookmark**: if `isCurrentBookmarked`, DELETEs existing (finds by sceneIndex or offset-proximity); otherwise POSTs new with computed label (`"Scene N · Title"` for cinematified, `"N% through"` for original). Toasts confirmation.
- **onJumpBookmark**: closes popover; cinematified → `jumpScene(bm.sceneIndex)`; original → `window.scrollTo` from `bm.offset`.
- **onDeleteBookmark**: DELETE by id, refresh, toast.
- **onJumpParagraphFromSearch**: `querySelector('[data-paragraph-id="{id}"]')` → `scrollIntoView({ block: 'center' })` → add `reader-flash-highlight` class for 2s.
- **onJumpSceneFromSearch**: `querySelector('[data-scene-id="{id}"]')` → `scrollIntoView({ block: 'start' })`.
- **onStartOver**: scrollTo top, dismiss hint, POST progress=0.
- **Keyboard handler** updated: Cmd/Ctrl+K → `setSearchOpen(true)`. Escape closes overlays in priority order (search → bookmarks → hint → immersive). Arrow keys disabled while search/bookmarks open.

### CSS addition (globals.css)
- `.reader-flash-highlight` class with `@keyframes reader-flash` (2s): amber background pulse (0.35 → 0.12 → 0) + box-shadow ring expansion (6px → 12px → 0). Applied to paragraphs after search-result jump for visual feedback.

## Verification
- `bun run lint` → clean (no errors, no warnings).
- `npx tsc --noEmit --skipLibCheck` → no reader-specific errors (only unrelated errors in skills/ folder and export route).
- File: 2,789 lines, 17 named components/exports, 3 new types, 2 new helpers.

## Design-system adherence
- Color: text-amber, text-ivory, text-slate, bg-midnight, bg-plum, border-amber/15-40, text-amber-gradient, text-tension. No blue/indigo.
- Typography: `.font-mono` for eyebrows + tags + kbd hints, `.font-serif` for titles, italic for snippets.
- Components: `.glass-strong`, `.scrollbar-lemniscate`, `.divider-gold`, `.shadow-cinema`, `.text-amber-gradient`.
- Motion: `spring.snappy` (dropdowns/popovers), `spring.gentle` (overlay/hint), `spring.bouncy` (bookmark toggle icon swap). All via framer-motion AnimatePresence.

## Accessibility
- aria-label on all new icon-only buttons (Search, Bookmark toggle, Bookmarks list, Export, X close).
- `aria-keyshortcuts="Meta+K Ctrl+K"` on Search button.
- `aria-expanded` on Export button.
- `role="dialog"` + `aria-modal="true"` on SearchOverlay.
- `role="menu"` + `role="menuitem"` on ExportMenu.
- Keyboard: Cmd/Ctrl+K opens search, Escape closes overlays in priority order, arrow keys disabled while overlays open.
- Focus management: search input auto-focuses on open (60ms delay for animation).
- Body scroll lock while search overlay is open.

## Known follow-ups
- The `paragraphIdx` saved to progress is the index from the closest `[data-paragraph-idx]` element. In CINEMATIFIED mode, paragraph indices may be local to their scene (depends on how the pipeline assigns them). The restoration primarily uses `scrollPct` so this is metadata-only — the scene index is the more important secondary coordinate.
- For very long narratives (>500 paragraphs), the `querySelectorAll('[data-paragraph-idx]')` call in `saveProgress` and the paragraph tracker runs on every save/scroll frame. The paragraph tracker is RAF-throttled, and `saveProgress` is debounced to 3s, so this is acceptable. If perf becomes an issue, could cache the paragraph list and invalidate on narrative change.
- The "Start over" button in ContinueReadingHint POSTs progress=0 immediately, which means the next visit will start fresh. This is the intended behavior.
- Bookmarks in ORIGINAL mode use `sceneIndex=null` and rely on `offset` (scrollPct) for jumping. The 3% proximity threshold for `isCurrentBookmarked` is a heuristic — could be made configurable if users find it too tight/loose.
