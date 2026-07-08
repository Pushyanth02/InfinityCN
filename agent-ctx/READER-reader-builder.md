# READER — Reader Builder

**Task ID:** READER
**Agent:** Reader Builder
**Task:** Build the premium reader experience at `src/components/lemniscate/views/reader.tsx`

## Context consumed
- `worklog.md` — full project history (Velvet Noir theme, deterministic NLP, Prisma schema, API routes, narrative-viewer patterns).
- `src/app/globals.css` — design tokens: `.reader-canvas` (38rem max-width, 1.85 line-height, ivory text), `.text-reader-body`, `.scene-heading` (mono, uppercase, centered, amber), `.scene-separator` (gold filigree with side lines), `.glass-strong`, `.divider-gold`, `.text-amber-gradient`, `.shimmer-text`, `.scrollbar-lemniscate`, semantic color vars (`--midnight`, `--ivory`, `--amber`, `--slate`, `--burgundy`, `--tension`, `--calm`, `--climax`, `--plum`).
- `src/lib/motion.ts` — variants: `bookOpen` (rotateY -12 → 0, scale 0.92 → 1), `sceneTransition` (x 24 → 0, opacity), `revealBlur` (blur 12px → 0), `staggerContainer`, `staggerFast`, `hoverLift`, `spring` presets (snappy/gentle/slow).
- `src/components/lemniscate/store.ts` — `useLemniscate` with `activeNarrativeId`, `activeMode`, `readerFontSize` ('sm'|'md'|'lg'|'xl'), `readerTheme` ('dark'|'light'), `readerImmersive`, `openLibrary`, `openCharacters`, `openScenes`, `setReaderFontSize`, `setReaderTheme`, `toggleReaderImmersive`.
- `src/components/lemniscate/logo.tsx` — `InfinityFlow` (animated dashed infinity), `Flourish` (gold filigree divider).
- `src/app/api/narratives/[id]/route.ts` — returns `{ narrative: { ...paragraphs, ...scenes (with paragraphs + events), ...characters, ...locations, ...arcs, ...peaks, metadata } }`. Scene DB schema lacks `heading` and `dominantEmotion` columns → built heading from `location`+`timeOfDay` (+ matched Location.type for INT./EXT. prefix), used `mood` for emotion label.
- `src/components/lemniscate/app.tsx` — confirms `view === 'reader' && readerImmersive` hides AppHeader/AppFooter; reader provides its own internal chrome.
- `src/components/lemniscate/shell/header.tsx` — uses `useTheme()` from next-themes for theme toggle (reader follows the same pattern to stay in sync).

## File produced
`src/components/lemniscate/views/reader.tsx` — `'use client'`, exports `ReaderView`. ~1600 lines, single file with 13 named sub-components.

## Architecture

### States
- **Empty** — `if (!narrativeId || !activeMode)` → centered card with BookOpen icon, "No narrative selected", "Open Library" button.
- **Loading** — `InfinityFlow` spinner + "Opening narrative…" + shimmer skeleton blocks (title, divider, 6 paragraph blocks with staggered animation-delay).
- **Error** — centered Card with AlertCircle (tension color), "Could not open narrative", Retry + Library buttons.
- **Loaded** — `motion.div` with `bookOpen` variant (rotateY entrance), perspective 1200.

### Fetch
- `fetchNarrative()` — AbortController-wrapped GET to `/api/narratives/${narrativeId}`. Returns cleanup function. `useEffect` calls it on mount + when `narrativeId` changes. AbortError silently ignored; other errors set `error` state.
- Mode guard: `effectiveMode = (activeMode === 'CINEMATIFIED' && narrative.mode === 'CINEMATIFIED') ? 'CINEMATIFIED' : 'ORIGINAL'` — falls back to ORIGINAL if narrative mode mismatches.

### Top progress bar
- `useScroll()` → `scrollYProgress` (0..1) → `useSpring` (stiffness 140, damping 30, mass 0.4) → `smoothProgress` MotionValue.
- `TopProgressBar` receives the MotionValue and binds `style={{ scaleX: smoothProgress }}` — no re-renders, GPU-accelerated.
- 3px tall, fixed top, z-60. Gradient: calm teal → amber → burgundy. Gold glow shadow.
- `useMotionValueEvent(smoothProgress, 'change', ...)` samples the value into a `progress` number state for the BottomNav percentage display.

### Top bar (non-immersive, or immersive + active)
- `AnimatePresence` wraps it; visible when `controlsVisible || !immersive`.
- Glass-strong background, divider-gold top edge, h-14.
- Left: ArrowLeft → `openLibrary`.
- Center: mode icon (Film/Type) + truncated serif title + mode Badge ("Cinema"/"Original").
- Right controls:
  - Font size: `A-` / `A+` button group with current size label (sm/md/lg/xl). Cycles via `FONT_SIZE_ORDER`. Hidden on xs (replaced by single Type icon).
  - Theme toggle: Sun/Moon icon. Calls `setReaderTheme` + `setGlobalTheme` (next-themes) to keep in sync.
  - Characters: Users icon → `openCharacters(narrative.id)`. Hidden on xs.
  - Scenes: ScrollText icon → `openScenes(narrative.id)`. Cinematified only. Hidden on xs.
  - Immersive: Maximize2/Minimize2 icon → `toggleImmersive`.

### ORIGINAL mode reader
- `motion.article` with `staggerContainer` variant, `reader-canvas` class, inline `fontSize` style (17/18/20/23px for sm/md/lg/xl).
- Title header: "Original Mode" eyebrow, `text-display` + `text-amber-gradient` title, word count / reading time / paragraph count, Flourish divider.
- `ParagraphBlock` per paragraph — `useInView(once: true, margin: '-10% 0px')`, `revealBlur` variant. Type-specific rendering:
  - HEADING: `<h2>` (amber, serif, via `.reader-canvas h2` CSS).
  - DIALOGUE: `<blockquote>` with gold left border, italic, speaker attribution (mono uppercase).
  - TRANSITION: centered italic muted.
  - THOUGHT: italic muted.
  - ACTION: `<p>` tighter spacing.
  - NARRATION: `<p>` default.
- End card: Flourish + "The End" + word count.

### CINEMATIFIED mode reader
- `motion.article` with `bookOpen` variant, max-w-3xl, pb-32.
- Title header: "Cinematified" eyebrow (Film icon), `text-display` gradient title, scene/character/reading-time stats, Flourish.
- Verbatim-source disclaimer (italic, muted).
- Per scene (`SceneCinematic`):
  - `useInView(ref, { margin: '-40% 0px' })` for active-scene tracking → calls `onSceneInView(index)`.
  - `useInView(ref, { once: true, margin: '-10% 0px' })` for reveal-once animation.
  - `sceneTransition` variant on `<motion.section>`, `animate={inViewOnce ? 'animate' : 'initial'}`.
  - **Tension rail**: absolute right edge, 3px wide, md+ only. Background track + `motion.div` height = `tensionScore%`, color via `tensionColor()` (calm teal < 33, amber 33-66, burgundy > 66).
  - **Scene heading**: `.scene-heading` class (mono, uppercase, centered, amber, tracked). Built via `buildSceneHeading()` — uses `scene.heading` if present, else `INT./EXT. LOCATION — TIME` from `location` + matched `Location.type` + `timeOfDay`.
  - **Scene title + indicators**: "Scene N. Title" + mood (Waves icon, mood-colored dot), tension (Activity, %), emotion (Heart), location (MapPin), time (Clock).
  - **Scene summary**: `<blockquote>` italic muted, gold left border, centered, max-w-2xl.
  - **Paragraphs**: `staggerFast` container with `revealBlur` children. Type-specific:
    - DIALOGUE: centered, mono uppercase speaker name above, italic ivory text.
    - HEADING: centered serif amber.
    - TRANSITION: centered italic muted.
    - THOUGHT: italic muted.
    - ACTION: left-aligned, pl-4 indent.
    - NARRATION: default `<p>`.
  - **Scene characters footer**: inline pills for characters appearing (by paragraph speaker + event participants), protagonist gets amber dot.
- **Scene separator** between scenes: `.scene-separator` class with `Flourish` ornament.
- End card: Flourish + "Fin." + scene/word count.

### Right sidebar (Cinematified, non-immersive, lg+)
- `motion.aside` slides in from right (x 40 → 0), sticky top-20, w-72, glass background, custom scrollbar, h-[calc(100vh-6rem)].
- **Current scene card**: scene number + title, mono heading, mood (colored dot), tension (%), emotion, tension bar (animated width).
- **Scene jump list**: max-h-72 scrollable. Each row: active dot, scene number (mono), title (truncated), tension mini-bar. Click → `jumpScene(i)` → `el.scrollIntoView({ behavior: 'smooth', block: 'start' })`.
- **In this scene**: characters appearing in current scene (from paragraph speakers + event participants), with role badges (PROTAGONIST=amber, ANTAGONIST=tension, others=slate).

### Bottom navigation
- `AnimatePresence` wrapped; visible when `controlsVisible || !immersive`.
- Fixed bottom, glass-strong rounded-full pill, max-w-3xl, shadow-cinema.
- Prev (ChevronLeft) / Next (ChevronRight) buttons.
- Center: Cinematified → "Scene X of Y" + progress bar (width = (X+1)/Y). Original → "N% read" + progress bar (width = scroll%).
- Immersive mode: outer container `pointer-events-none`, inner pill `pointer-events-auto` (so clicks pass through except on the pill).

### Immersive mode
- `readerImmersive` true → app.tsx hides AppHeader/AppFooter.
- Reader's TopBar + BottomNav fade out via `controlsVisible` state.
- `bumpActivity()` callback: sets `controlsVisible(true)`, resets 3s timeout → `setControlsVisible(false)`.
- `useEffect` on `immersive`: on enter, calls `bumpActivity()` (shows controls, auto-hides after 3s). On exit, sets `controlsVisible(true)`.
- Window listeners (immersive only): `mousemove`, `touchstart`, `scroll` → `bumpActivity()`.
- Keyboard: `Escape` → `toggleImmersive()` (exits immersive). `ArrowLeft`/`ArrowRight` (Cinematified only) → `gotoPrevScene()`/`gotoNextScene()`.

### Theme sync
- `useTheme()` from next-themes. On `globalTheme` change, syncs `readerTheme` store to match.
- Toggle: updates both `setReaderTheme` (store, for icon) and `setGlobalTheme` (next-themes, for actual `<html>` class).
- No manual `document.documentElement` class manipulation — next-themes handles it (avoids conflicts with AppHeader's theme toggle).

### Font size cycle
- `FONT_SIZE_ORDER = ['sm', 'md', 'lg', 'xl']`, `FONT_SIZE_PX = { sm:17, md:18, lg:20, xl:23 }`.
- `onCycleFont(dir)`: finds current index, wraps with modulo, calls `setReaderFontSize(next)`, fires toast.
- Applied as inline `style={{ fontSize: '${px}px' }}` on `.reader-canvas` elements.

### Scene navigation
- `sceneRefs` Map<number, HTMLElement | null> populated by `registerRef(i, el)` in `SceneCinematic` useEffect.
- `jumpScene(i)`: looks up ref, calls `el.scrollIntoView({ behavior: 'smooth', block: 'start' })`, sets `currentSceneIdx`.
- `gotoPrevScene`/`gotoNextScene`: bounded by scene count.
- Original mode prev/next: `scrollByPage(dir)` → `window.scrollBy({ top: dir * innerHeight * 0.8, behavior: 'smooth' })`.

### Responsive
- Mobile (xs): font controls collapse to single Type icon; Characters/Scenes explorer buttons hidden (sm:inline-flex). Sidebar hidden (lg:block). Top bar compact (h-14, gap-2).
- sm: font A-/A+ group appears, explorer buttons appear.
- lg: sidebar appears (Cinematified + non-immersive).
- Tension rail hidden on mobile (md:block).

## Design-system adherence
- Color: text-amber, text-ivory, text-slate, bg-midnight, bg-plum, border-amber/15-40, text-amber-gradient, text-tension, text-calm, text-climax, text-chart-4. No blue/indigo.
- Typography: `.text-display` (titles), `.text-title` (scene titles), `.text-reader-body` via `.reader-canvas`, `font-mono` for scene headings + eyebrows + tags, `font-serif` for titles.
- Components: `.glass-strong`, `.divider-gold`, `.scrollbar-lemniscate`, `.scene-heading`, `.scene-separator`, `.shimmer-text` (via skeleton).
- Motion: `bookOpen` (container entrance), `sceneTransition` (per-scene), `revealBlur` (paragraphs + headers), `staggerContainer`/`staggerFast` (sequencing), `hoverLift` (buttons), `spring.snappy`/`gentle` (transitions).

## Accessibility
- Semantic HTML: `<article>`, `<section>`, `<header>`, `<aside>`, `<blockquote>`.
- aria-label on icon-only buttons (Back, Font size, Theme, Characters, Scenes, Immersive, Prev, Next).
- aria-hidden on decorative SVGs, tension rails, ambient spotlight.
- Keyboard: Escape (exit immersive), ArrowLeft/Right (navigate scenes).
- Focus-visible rings via shadcn Button defaults.

## Verification
- `bun run lint` → clean (no errors, no warnings).
- `npx tsc --noEmit --skipLibCheck` → no errors in reader.tsx.
- File: 1601 lines, 13 named components, exports `ReaderView`.

## Known follow-ups
- The Scene DB schema doesn't persist `heading` or `dominantEmotion` (only in the in-memory cinematified pipeline type). The reader rebuilds `heading` from `location`+`timeOfDay`+matched `Location.type` and uses `mood` for the emotion label. If a future migration adds these columns, the reader will use them directly (`scene.heading` is checked first).
- The `progress` number state (for BottomNav percentage) updates on every scroll frame via `useMotionValueEvent`. Could be throttled if perf becomes an issue on very long narratives, but it's a single state update per frame — negligible.
