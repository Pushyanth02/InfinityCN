# CHAR-GRAPH — Character Graph Builder

**Task ID:** CHAR-GRAPH
**Agent:** Character Graph Builder
**Task:** Add a Character Relationship Graph (visual SVG node-edge constellation) to the Characters view.

## Context consumed
- `/home/z/my-project/worklog.md` — full project history. Lemniscate is a deterministic document-to-storytelling platform (Next.js 16 + TS + Tailwind 4 + shadcn/ui). Velvet Noir palette: `midnight / ivory / amber / slate / burgundy / plum / calm`. The Characters view (`src/components/lemniscate/views/characters.tsx`) already shipped as part of Phase 4 — card grid + sticky detail panel with appearance timeline, stats, aliases, and "Read in Cinematified Mode" CTA.
- `src/components/lemniscate/views/characters.tsx` (pre-change, 262 lines) — original `CharactersView` with `CharacterData`/`NarrativeData` types, fetches `/api/narratives/${narrativeId}`, renders card grid (`roleCardConfig`) on the left and `motion.div` detail panel on the right in a `lg:grid-cols-[1fr_340px]` grid.
- `src/lib/motion.ts` — `spring` presets (default/snappy/gentle/bouncy/slow), `staggerContainer`, `revealScale`, `hoverLift`. Used for toggle pill + node entrance + view-mode swap.
- `src/components/lemniscate/store.ts` — `useLemniscate` store; `activeNarrativeId`, `openLibrary`, `openReader`, `openScenes` actions.
- `src/app/api/narratives/[id]/route.ts` — GET returns `{ narrative: { ...narrative, scenes: [...scenes with paragraphs[]], events, characters, ... } }`. Each scene has `paragraphs[]` (filtered by offset overlap) with `text` field.
- `prisma/schema.prisma` — `Character.aliases` is a `String` stored as JSON (`@default("[]")`), `role` is `PROTAGONIST | ANTAGONIST | SUPPORTING | MINOR`, `mentions`, `firstAppearanceOffset`, `dialogueLines`. `Scene` has `paragraphs` via offset overlap.
- `src/app/globals.css` — design tokens: `--amber: oklch(0.82 0.12 75)`, `--burgundy: oklch(0.45 0.13 25)`, `--calm: oklch(0.6 0.14 165)`, `--slate: oklch(0.55 0.015 260)`, `--midnight`, `--ivory`, `--plum`. Plus `.surface-raised`, `.divider-gold`, `.text-headline`, `--font-serif-display`, `--font-mono-stack`.
- Other agent records in `/agent-ctx/` (LIBRARY, READER, LANDING, READER-ENHANCE) — confirmed pattern of writing detailed work records.

## File produced
`src/components/lemniscate/views/characters.tsx` — `'use client'`, exports `CharactersView`. Grew from 262 → 758 lines. 3 new internal components (`RelationshipGraph`, `CharacterDetailPanel`, `useGraphData` hook), 4 new types (`ViewMode`, `GraphNode`, `GraphEdge`, `GraphData`), 5 new helpers (`asAliases`, `escapeRegex`, `characterInText`, `roleColor`, `roleLabel`).

## Architecture additions

### Helpers
- `asAliases(raw: unknown): string[]` — tolerant of either a JSON-string (DB shape) or already-parsed array. Filters to non-empty strings. Replaces the fragile direct array access in the original card view.
- `escapeRegex(s)` — escapes regex metachars for safe name → RegExp construction.
- `characterInText(c, text)` — true if `c.name` OR any alias matches in `text` using `(?<![\w'])NAME(?![\w'])` (word boundary tolerant of apostrophes/hyphens inside names, case-insensitive).
- `roleColor(role)` / `roleLabel(role)` — map role enum → CSS var / human label, falling back to MINOR.

### Graph data model + hook
- `GraphNode`: `{ id, name, role, mentions, x, y, r, color, character }` (x/y in viewBox coords).
- `GraphEdge`: `{ key, from, to, fromName, toName, count, x1, y1, x2, y2 }`.
- `GraphData`: `{ nodes, edges, maxCount, scenePresence, coOccurrences }`.
- `useGraphData(characters, scenes)` — memoized. Pipeline:
  1. For each scene, concatenate `paragraphs[].text` and detect present characters (`characterInText`).
  2. Tally per-character scene count → `scenePresence`.
  3. Build pair-wise co-occurrence map (`pairKey` sorts ids so A|B === B|A), incrementing for every scene where both appear.
  4. Track `maxCount` for opacity scaling.
  5. Circular layout: `cx=400, cy=250, baseR=180` (= `min(W,H)/2 - 70`). `angle = (i/n) * 2π - π/2` (start at top). `layoutR=0` if `n===1` (single node centered).
  6. Node radius: `min(40, 10 + sqrt(mentions) * 3)` (capped so a 1000-mention protagonist doesn't dwarf the layout).
  7. Edges filtered to `count >= 1`, sorted ascending by count so thicker lines paint on top.

### RelationshipGraph component
Props: `characters`, `selectedId`, `onSelect`, `graphData`. Internal state: `hoveredId`.

**SVG** (viewBox `0 0 800 500`, `preserveAspectRatio="xMidYMid meet"`, `h-[440px] sm:h-[500px] w-full`):
- `<defs>`: `radialGradient#graphCosmos` (plum → midnight, 55% → 0% opacity) for cosmic backdrop; `<filter id="nodeGlow">` Gaussian blur + merge for halo.
- Cosmic backdrop `<rect>` fill `url(#graphCosmos)`.
- 70 deterministic decorative stars (seeded Mulberry32 PRNG at `0x1337c0de`) — small ivory circles at low opacity.
- **Edges**: `<motion.path d="M x1 y1 L x2 y2">` with `pathLength` entrance animation (delay `0.5 + idx*0.012`, duration 0.5) + opacity transition. Stroke = `var(--ivory)` (or `var(--amber)` when highlighted). strokeWidth = `min(6, 1 + count * 0.5)`. strokeOpacity = `0.2 + (count / maxCount) * 0.6` (dimmed to 0.04 when not connected to hovered; bumped to ≥0.9 when highlighted). `pointerEvents: 'none'` so they don't capture clicks. `<title>` for native tooltip.
- **Nodes**: outer `<g transform="translate(x,y)">` for absolute positioning (SVG transform attribute, doesn't conflict with CSS transforms on inner motion.g). Inner `<motion.g>` with `transformBox: 'fill-box'` + `transformOrigin: 'center'` so `scale` happens around the visual node center. Entrance: stagger by index (`delay = 0.1 + i*0.04`, spring `stiffness=280 damping=22`).
  - Children: outer halo circle (`r + 8`, fill=color, opacity 0.05–0.32 depending on state, `filter="url(#nodeGlow)"`); selected dashed ring (`r + 5`, dashed amber); main circle (`r`, fill=color, stroke=midnight); inner sheen (`-r*0.25, -r*0.25`, radius `r*0.35`, ivory at 18% for 3D feel); label `<text>` (serif, 11px, `paintOrder="stroke"` with 3px midnight stroke for halo legibility over edges); mention count `<text>` (mono, 9px, amber); invisible hit-area circle (`r + 12`, min 26) so hovering near (not just on) the node works.
  - Hover/selected state: scale 1.15 / 1.08; halo opacity boosts; non-connected nodes dim to 0.25 opacity.

**Hover highlight logic**:
- `connectedIds` memo: Set of hovered node + all nodes it shares an edge with.
- Edges: highlighted if hovered is one endpoint; dimmed (0.04 opacity) if hovered is set but edge isn't highlighted; color shifts to `var(--amber)` when highlighted.
- Nodes: dimmed to opacity 0.25 if hovered set and node not in `connectedIds`.

**Click**: `onSelect(character)` → updates parent `selected` state → detail panel switches.

**Legend bar** (below SVG): for each role with count > 0, a colored dot + label + count. Plus two extra hint chips: "Node size = mentions" and "Edge weight = shared scenes".

**Empty state**: if `nodes.length === 0`, render a centered "No characters to graph." panel.

**Accessibility**: `role="img"` + descriptive `aria-label` on container; `<title>` inside each motion.path (edge) and motion.g (node) for native SVG tooltips; each toggle button has `aria-pressed`.

### CharacterDetailPanel component (extracted + enhanced)
Shared between cards and graph modes. Props: `character`, `narrative`, `graphData` (nullable), `onRead`.

Sections (top to bottom):
1. **Header**: colored role dot + serif name + mono uppercase role label.
2. **Appearance Timeline** (existing logic, ported to use `characterInText` helper): h-12 midnight track with amber dots positioned by scene-index percentage. Empty state if no appearances. Stagger entrance via `spring.snappy`.
3. **Top Connections** (NEW — only when `graphData` is provided, i.e. graph mode): top 4 co-occurring characters by shared-scene count. Each row: role-colored dot + name + mono "{count} shared".
4. Separator.
5. **Stats grid** (2-col): mentions + dialogue lines.
6. **Aliases** (if any): amber-tinted outline badges.
7. **Read button**: full-width outline amber → opens reader in CINEMATIFIED mode.

### CharactersView main (modified)
- New state: `viewMode: ViewMode` (`'cards' | 'graph'`, default `'cards'`).
- `useGraphData(characters, scenes)` always computed (cheap memoization, reused by both graph + detail panel).
- Title row now `flex-col sm:flex-row sm:items-end sm:justify-between` — title on left, toggle on right.
- **Toggle** (segmented control): `<div class="inline-flex rounded-lg border border-amber/15 bg-midnight/40 p-1">` with two buttons. Active state shows a sliding `<motion.span layoutId="viewModePill" class="bg-amber">` (spring.snappy). Icons: `LayoutGrid` for Cards, `Share2` for Relationship Graph. Short label ("Cards"/"Graph") on mobile, full label ("Relationship Graph") on sm+.
- **Main grid** unchanged layout (`lg:grid-cols-[1fr_340px]`). Left column wrapped in `<AnimatePresence mode="wait">` swapping between `motion.div key="cards"` (staggered card grid — preserved verbatim from original) and `motion.div key="graph"` (new `<RelationshipGraph>`). Right column: shared `<CharacterDetailPanel>` (keyed by `selected.id`, x-slide transition).
- Detail panel receives `graphData={viewMode === 'graph' ? graphData : null}` — controls whether the "Top Connections" section renders.

### Defensiveness fixes vs. original
- `aliases` access now goes through `asAliases()` helper — handles DB JSON-string shape. Original code called `.slice(0, 3).map(...)` directly which would throw on a string. (This bug was latent in the original card view; now fixed in both card and detail panel.)
- Appearance-timeline scene filter now uses the shared `characterInText` (name + aliases, word-boundary regex) instead of `sceneText.includes(selected.name)` — catches alias-only mentions and avoids substring false-positives like "Mark" inside "marker".
- Timeline dots use `left: calc(${pct}% - 4px)` so they center on their position instead of offsetting right.

## Verification
- `bun run lint` → clean (no errors, no warnings).
- `npx tsc --noEmit --skipLibCheck` → no errors introduced. Only pre-existing error remains (`src/app/api/narratives/[id]/export/route.ts:59` Buffer vs BodyInit — flagged by READER-ENHANCE agent too, unrelated to this task).
- File: 758 lines, 1 named export (`CharactersView`), 3 internal components, 1 hook, 5 helpers.

## Design-system adherence
- Color: `var(--amber)`, `var(--burgundy)`, `var(--calm)`, `var(--slate)`, `var(--midnight)`, `var(--ivory)`, `var(--plum)`. NO blue/indigo.
- Typography: `font-serif` for titles + node labels, `font-mono` for eyebrows + counts + legend.
- Surfaces: `.surface-raised`, `.divider-gold` on the detail panel card (matches original).
- Motion: `spring.snappy` (toggle pill), `spring.gentle` (view-mode swap + detail panel slide), spring with stiffness=280/damping=22 (node entrance), `pathLength` + opacity (edge entrance), staggered delays by index for both nodes and edges.
- Icons: `LayoutGrid`, `Share2`, `Link2` from lucide-react (plus pre-existing `ArrowLeft`, `Film`, `Crown`, `Skull`, `User`, `Sparkles`, `MessageSquare`, `Clock`).
- Removed unused imports from original (`Users`, `Type`, `TrendingUp`, `InfinityFlow`, `ScrollArea`).

## Accessibility
- Toggle buttons: `aria-pressed={isActive}`.
- Graph container: `role="img"` + descriptive `aria-label`.
- SVG `<title>` children on every edge + node for native tooltip + screen-reader fallback.
- All interactive elements have ≥26px hit radius (invisible hit-area circle on nodes).
- Keyboard: nodes are SVG `<g>` — click works via mouse. Keyboard focus on SVG nodes is limited (SVG focusability varies by browser); the card view remains the keyboard-accessible path to character selection.

## Performance notes
- `useGraphData` memoizes on `[characters, scenes]` — recomputes only when narrative changes.
- `connectedIds` recomputed on `[hoveredId, edges]` — only when hovering changes.
- 70 stars generated once via `useMemo([])`.
- Co-occurrence is O(scenes × characters²) in the worst case — fine for typical narratives (≤100 scenes, ≤50 characters). For very large casts (>200 characters), the per-scene character-presence scan could be optimized by precompiling a single regex per character, but this is an edge case for a deterministic NLP pipeline.
- The graph renders ~200 SVG elements max (50 nodes + 100 edges + 70 stars + decorations) — well within SVG performance budget.

## Known follow-ups
- The graph uses a static circular layout (no force simulation). For very lopsided casts (1 protagonist + 30 minor characters), the protagonist sits on the same ring as everyone else. A future enhancement could place protagonists/antagonists on inner rings — but the spec asked for "simple circular layout, no physics engine", so this is intentional.
- Node labels can overlap when 20+ characters are crammed into the circle. The 11px serif font + 3px midnight stroke halo helps legibility, but at >25 nodes it gets visually busy. Consider hiding labels for MINOR characters on hover-only at high counts.
- The "Top Connections" section in the detail panel only appears in graph mode (when `graphData` is passed). Could be shown in card mode too by always passing `graphData`, but the section is most meaningful as a companion to the visible graph.
