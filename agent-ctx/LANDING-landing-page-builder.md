# LANDING — Landing Page Builder

**Task ID:** LANDING
**Agent:** Landing Page Builder
**Task:** Build the Lemniscate landing page at `src/components/lemniscate/views/landing.tsx`

## Context consumed
- `worklog.md` — project overview (deterministic classical-NLP doc-to-story platform, Velvet Noir theme, embedded poller architecture, sample endpoint `POST /api/sample?mode=BOTH`).
- `src/app/globals.css` — design tokens (deep midnight + warm ivory + golden amber + slate + burgundy), `.text-display`, `.text-headline`, `.text-title`, `.surface-raised`, `.glass`, `.text-amber-gradient`, `.text-ivory-gradient`, `.divider-gold`, `.shadow-cinema`, `.shadow-glow-amber`, `.shimmer-text`, `.lemniscate-flow` keyframes, `--font-reader`, `--font-serif-display`, `--font-mono-stack`.
- `src/lib/motion.ts` — variants: `pageTransition`, `staggerContainer`, `staggerFast`, `revealUp`, `revealFade`, `revealScale`, `revealBlur`, `hoverLift`, `hoverScale`, `hoverGlow`.
- `src/components/lemniscate/store.ts` — Zustand store `useLemniscate` with `openProcessing(jobId, documentId)`, `openLibrary()`, `openLanding()`.
- `src/components/lemniscate/logo.tsx` — `InfinityMark`, `InfinityFlow`, `InfinityHero` (gold gradient + glow), `Flourish` (gold filigree divider).
- `src/app/api/sample/route.ts` — confirmed `POST /api/sample?mode=BOTH` returns `{ jobId, documentId, sampleTitle }`.
- shadcn primitives: `Button`, `Card`, `Badge`, `Accordion/*`.

## File produced
`src/components/lemniscate/views/landing.tsx` — `'use client'`, exports `LandingPage`. ~1300 lines, 9 sections, fully responsive, mobile-first.

## Sections
1. **HeroSection** — `min-h-screen`, `InfinityHero` with breathing amber spotlight, `.text-display` headline with `.text-amber-gradient` on "Living Narratives", subheadline, two CTAs (primary "Try the Sample Story" via `useSampleHandler()` → `fetch('/api/sample?mode=BOTH', { method:'POST' })` → `openProcessing(data.jobId, data.documentId)`, secondary outline "Upload Your Own" → `openLibrary()`), trust badges row (Offline · No AI / Privacy-first / Self-hostable), 8 floating amber particles drifting up with deterministic config (no hydration mismatch), scroll cue.
2. **TransformPreview** — `useInView` from framer-motion (per task spec). Side-by-side: left card with monospace messy/hyphenated raw text + paper-line texture overlay; center animated `InfinityFlow` + arrow (horizontal desktop / rotated vertical mobile); right card with `INT. LIGHTHOUSE COTTAGE — DAWN` scene heading, serif narration, centered dialogue blocks for MARIN/ELARA, meta tags (Scene 1 / 2 Characters / Tension 0.62 / Calm→Climax). Stagger children reveal.
3. **TwoModesShowcase** — `.text-headline` "Two Reading Experiences". Two large `surface-raised` cards: ORIGINAL MODE (Type icon, slate accent, "Faithful Reconstruction") and CINEMATIFIED MODE (Film icon, amber accent, "Cinematic Storytelling", "Recommended" badge, amber radial glow). Both with checkmark feature lists, `hoverGlow` + `y:-6` lift.
4. **FeatureHighlights** — 6 features in 1/2/3-col responsive grid: Scene Detection (Film), Character Awareness (Users), Narrative Arcs (TrendingUp), Tension Curve (Activity), Emotional Peaks (Heart), Privacy First (ShieldCheck). `revealUp` stagger + `hoverGlow` + hover "Deterministic →" indicator.
5. **StatsStrip** — horizontal `.glass` strip with 4 `.shimmer-text` stats: ∞ Narratives / 100% Offline / 0 AI APIs / Classical NLP.
6. **Pricing** — 3 tiers: Reader (Free) / Author ($12/mo, "★ Most Popular", amber border + radial glow + hoverGlow) / Studio ($49/mo). `hoverLift`. Reader CTA runs the sample; others are placeholder.
7. **FAQ** — shadcn `Accordion` inside shadcn `Card`. 5 questions: Is this an AI writer? / What file types are supported? / Does my data leave your device? / Can I self-host? / How does the cinematification work?
8. **FinalCTA** — amber radial glow background + breathing pulse halo, `InfinityHero`, `.text-display` "Begin Your Narrative Journey", large sample button with shimmer sweep, "No account · No upload · No AI" footer.
9. **LandingFooter** — `Flourish` divider + lemniscate keyword chain + © line.

## Hooks / patterns
- `useSampleHandler()` — shared hook used by Hero, Pricing, and FinalCTA. POSTs to `/api/sample?mode=BOTH`, fires `useToast` on success/error, calls `openProcessing(jobId, documentId)`, manages `loading` state with `AnimatePresence` mode="wait" for the button label swap.
- `useInView` on TransformPreview ref (per task spec). Other sections use `whileInView` with `viewport={{ once: true, margin: '-80px' }}`.
- `staggerContainer` wraps every section; children use `revealUp` / `revealBlur` / `revealScale` per rhythm.
- `FloatingParticles` uses deterministic `useMemo` config (no Math.random at render time → no SSR hydration mismatch).
- All CTAs carry `hoverLift` (or `hoverGlow` on cards).

## Design-system adherence
- Color: text-amber, text-ivory, text-slate, bg-midnight/40, border-amber/15-40, surface-raised, glass, text-amber-gradient, text-ivory-gradient, divider-gold, shadow-cinema, shadow-glow-amber. No indigo/blue.
- Typography: `.text-display` (hero, final CTA, pricing price), `.text-headline` (section titles), `.text-title` (card titles), `var(--font-reader)` for body prose, `var(--font-mono-stack)` for scene headings + eyebrows + tags.
- Mobile-first responsive: stacks → grids at `sm:` / `lg:` breakpoints. Two-mode cards stack to 1-col on mobile, 2-col on `lg:`. Feature grid 1 → 2 → 3 cols. Pricing 1 → 3 cols. Transform preview 3-col → stacked with vertical infinity on mobile.
- Semantic HTML: `<section aria-labelledby>`, `<h1>`/`<h2>`/`<h3>`, `<footer>`, `<ul>`/`<li>`.
- Accessibility: aria-hidden on decorative SVGs/gradients/particles, `aria-labelledby` on every section, sr-only-equivalent tracking-wide mono eyebrows, disabled state on loading buttons.

## Verification
- `bun run lint` → clean (no errors, no warnings).
- Dev server compiled the page (turbopack) on initial `GET /` — no compile errors in `dev.log`.
- File: 1299 lines, 13 named functions, 0 duplicate defs.
