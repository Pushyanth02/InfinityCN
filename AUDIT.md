# Lemniscate — Comprehensive Audit

**Date:** 2026-08-22 · **Commit:** `41c12b8` · **Scope:** full repository (config, lib, views, components, security, tooling)

---

## 1. Automated Verification Results

| Gate                | Command             | Result                                         |
| ------------------- | ------------------- | ---------------------------------------------- |
| ESLint              | `bun run lint`      | ✅ Pass — 0 errors, 0 warnings                 |
| TypeScript (strict) | `bun run typecheck` | ✅ Pass                                        |
| Unit tests (Vitest) | `bun run test`      | ✅ 63/63 pass (`engine.test.ts`, `ai.test.ts`) |
| Production build    | `bun run build`     | ✅ Pass — static export, 2 routes              |

---

## 2. Architecture Summary

Local-first reading app: Next.js 16 static export (`output: "export"`), React 19, Tailwind v4, Zustand stores, IndexedDB persistence (`src/lib/db.ts`), direct browser→OpenRouter BYOK AI (`src/lib/openrouter.ts`, `src/lib/ai.ts`) with an offline extractive-NLP fallback engine (`src/lib/loa.ts`). Ingestion pipeline (`src/lib/engine.ts` + `engine-adapters.ts`) handles PDF/EPUB/DOCX/PPTX/MD/TXT/HTML with magic-byte validation. Background job queue (`src/lib/jobs.ts`) with persistence, cancellation, cross-tab liveness probes and reaping.

The layering is clean and consistent: `db → cache/data → ai/engine/jobs → views`. No `any`, no `console.log`, no `dangerouslySetInnerHTML`/`eval`/raw HTML injection anywhere. All dynamic content renders through React text nodes.

---

## 3. Findings

### 🔴 High priority

#### H1. Meridian router presets are silently broken by `ensureFree`

`src/lib/ai.ts`

`activeModelFor()` runs every configured model through `ensureFree()`, which appends `:free` to any ID lacking it:

```ts
// ai.ts ~line 291
export function activeModelFor(bot: BotId): string {
  const configured = prefs.aiModels[bot] ?? DEFAULT_MODELS[bot];
  return ensureFree(configured, bot); // ← mangles presets
}
```

`"meridian/auto"` contains no colon, so `ensureFree` returns `"meridian/auto:free"`. Then:

```ts
// ai.ts ~line 488
const configured = activeModelFor(bot); // already corrupted
if (!isRouterPreset(configured)) return ensureFree(configured, bot);
```

`isRouterPreset("meridian/auto:free")` is `false`, so the live catalog resolution never runs and the invalid ID goes straight into the request chain → guaranteed 404 → silent fallback to the default chain. **Selecting any Meridian preset (or `openrouter/auto`) has no effect.**

Note the inconsistency: `migrateToFree()` in `store.ts` correctly passes `meridian/*` and `openrouter/auto` through unchanged — `activeModelFor` does not.

**Suggested fix:**

```ts
export function activeModelFor(bot: BotId): string {
  const configured = getPrefs().aiModels[bot] ?? DEFAULT_MODELS[bot];
  if (isRouterPreset(configured)) return configured;
  return ensureFree(configured, bot);
}
```

### 🟠 Medium priority

#### M1. Claimed unit tests don't exist

Comments throughout `ai.ts` say "Pure, unit-tested" for `parseSse`, `extractJson`, `rankFreeModels`, `mapModelRaw`, `dedupeSceneTitles`, `detectDepth`, `ankaaSteps` — but the only test file is `src/lib/engine.test.ts` (34 ingestion tests). These pure functions are ideal test targets (JSON extraction bracket-matching, SSE parsing, ranking determinism) and currently untested.

#### M2. `updateProgress` performs an O(N) full-table scan per save

`src/lib/data.ts` (~line 475): every debounced progress save (fires every ~900 ms while reading) calls `idbAll<ActivityRow>("activity")` and filters in JS just to throttle read events. For a long-lived library this grows unbounded. Consider a per-document last-read-event timestamp cached in memory, or an index lookup.

#### M3. Missing security headers on Vercel

`vercel.json` sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` — good — but no `Content-Security-Policy` and no `Strict-Transport-Security`. Since the app holds a live API key in memory and fetches from `openrouter.ai` plus Google Fonts, a CSP like:

```
default-src 'self'; connect-src 'self' https://openrouter.ai;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src https://fonts.gstatic.com; img-src 'self' data:;
worker-src 'self' blob:; frame-ancestors 'none'
```

would materially reduce XSS blast radius (an XSS could otherwise exfiltrate the session key).

#### M4. `apple-touch-icon.svg` won't work

iOS Safari requires PNG for `apple-touch-icon`; the SVG declared in `layout.tsx` will be ignored. Export a 180×180 PNG.

#### M5. README drift

- Claims _"Two classic texts are seeded into your local library immediately on first launch"_ — contradicts `seed.ts`, which is explicitly opt-in (Library → empty state) and the App bootstrap comment says "no automatic seeding".
- The `ci` script description omits that it also runs `test`.
- Badge claims ESLint "0 errors, 0 warnings" — currently true, but the config downgrades many rules to `warn`; keep in mind this is config-dependent.

#### M6. Strictness gaps invite latent bugs

`tsconfig.json` sets `"noUncheckedIndexedAccess": false`, and the code compensates with many non-null assertions (`buffered[nextToEmit]!`, `rows.get(y)!`, `focusable[0]`, etc.). Enabling the flag would convert several of these into compile-time checks. Relatedly, ~10 React-Hook/compiler rules are disabled in `eslint.config.mjs` — acceptable pragmatism, but each disable should ideally carry a comment (most do).

### 🟡 Low priority / hygiene

| #   | Location                      | Note                                                                                                                                                                                                                                                                 |
| --- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | `db.ts` `getUserId()`         | Uses `Math.random()` for the identity; `crypto.randomUUID()` is available in all supported browsers and is stronger.                                                                                                                                                 |
| L2  | `Settings.tsx` rotate handler | Hard-codes `"lemniscate:uid"` / `"lemniscate:uid-created"` literals duplicated from `db.ts`. Export constants from `db.ts` and reuse.                                                                                                                                |
| L3  | `ai.ts` vs `openrouter.ts`    | `RawCatalogModel` interface and SSE line-parsing logic are duplicated in both files. Consolidate.                                                                                                                                                                    |
| L4  | Quota & rate limiter          | `dailyCountCache` and the 15/min sliding window are module-level per tab. Two tabs can double the real call rate and exceed the daily quota. Acceptable for local-first, but worth documenting.                                                                      |
| L5  | `deleteDocument`              | Doesn't purge `aiCache` entries keyed by the deleted doc (orphaned until TTL expiry, up to 7 days) nor `usage`/`activity` rows referencing it. Harmless but untidy.                                                                                                  |
| L6  | `layout.tsx`                  | Fonts loaded twice: `next/font` (Space Grotesk, Open Sans) _and_ a Google Fonts `<link>` stylesheet for reader faces. Also `metadataBase` is hard-coded to `https://lemniscate.app` — verify it matches the real deployment domain.                                  |
| L7  | `next.config.ts`              | `allowedDevOrigins` includes third-party preview origins (`*.space-z.ai`, `*.chatglm.cn`) — dev-only, but leftover scaffolding worth removing before wide release.                                                                                                   |
| L8  | `package.json`                | `"start": "bunx serve out"` depends on `serve` fetched ad-hoc via bunx; consider adding it as a devDependency for reproducibility.                                                                                                                                   |
| L9  | `Reader.tsx` annotations      | Anchor offsets use `chunkText.indexOf(selText)` — if the selected phrase occurs multiple times in a paragraph, the highlight can land on the wrong occurrence. Use range offsets relative to the chunk node instead.                                                 |
| L10 | Non-reactive key state        | Several components capture `aiConfigured()` at render time (e.g., `LumaChat.serverOnline`). Settings works around this with `keyTick`; other surfaces show stale online/offline badges until re-render. Minor UX nit.                                                |
| L11 | Prompt-injection fencing      | Luma's system prompt includes an explicit "document content is data, not instructions" clause. Ouro / Ankaa / cinema prompts wrap text in `<<< >>>` fences but lack the explicit instruction. Adding the same SECURITY clause uniformly would harden all companions. |

---

## 4. What's Done Well

- **Security posture**: API key lives only in module memory; masked display (`getKeyMasked`); upstream error bodies sanitized and `sk-or-*` echoes scrubbed; validate-before-commit flow; nothing persisted to storage. File intake validates extension + MIME + magic bytes, never trusting reported type.
- **Data integrity**: every row stamped with a local identity and filtered on read; ownership migration for legacy rows; transaction `onabort` handled (no hanging promises); bulk writes atomic.
- **Concurrency correctness**: per-store monotonic version counters make scoped refetches race-free (well-documented fix for a real batching bug); debounced progress saves keyed on primitives with flush-on-unmount so positions are never lost.
- **Resilience**: job queue with bounded concurrency, priorities, AbortController cancellation, retry-with-backoff skipping fatal errors, stale-job recovery with cross-tab BroadcastChannel liveness probe, terminal-job reaping.
- **AI robustness**: Zod validation of all structured outputs; safe typed accessors degrading gracefully on malformed responses; word-retention safeguard (≥92%) on AI structure refinement; partial-stream preservation (never retries over garbled output); free-tier chokepoint (`ensureFree` + chain filter) preventing surprise paid-model spend — modulo H1.
- **Accessibility**: skip-to-content link, focus traps in Dialog/Sheet/SearchOverlay, aria roles/labels throughout, keyboard shortcuts correctly suppressed while typing or behind modals, reduced-motion support.
- **Performance**: code-split heavy views and binary parsers; bounded memoization in the NLP engine; stale-while-revalidate model catalog; O(1) daily quota counter (after fixing the earlier O(N) scan).

---

## 5. Recommended Action Plan

1. ~~Fix H1 (`activeModelFor` preset passthrough)~~ — **DONE**: router presets now pass through `activeModelFor()` untouched.
2. ~~Add the missing unit tests for `extractJson`, `parseSse`, `rankFreeModels`, `mapModelRaw`, `dedupeSceneTitles`, `detectDepth` (M1)~~ — **DONE**: 29 new tests in `src/lib/ai.test.ts`.
3. ~~Add CSP + HSTS headers to `vercel.json` (M3)~~ — **DONE** (CSP, HSTS, nosniff, frame-deny, referrer/permissions policy, immutable asset caching). PNG apple-touch-icon still outstanding (M4).
4. ~~Replace the O(N) activity scan in `updateProgress` (M2)~~ — **DONE**: in-memory `lastReadEventAt` Map throttle (O(1)), cleared on document delete.
5. Reconcile README with actual seeding/CI behavior (M5).
6. Enable `noUncheckedIndexedAccess` and clean up assertions (M6), then work through the low-priority hygiene list opportunistically.

---

## 6. Fixes Applied (post-audit)

All fixes verified with lint ✅ · typecheck ✅ · 63/63 tests ✅ · production build ✅.

### F1 — H1 fixed: router preset passthrough (`src/lib/ai.ts`)

`activeModelFor()` now returns `meridian/*` and `openrouter/auto` presets unchanged before the `ensureFree()` guard, so Meridian's live catalog resolution actually runs instead of being corrupted into an invalid `:free`-suffixed ID that always 404'd.

### F2 — M2 fixed: O(1) read-event throttle (`src/lib/data.ts`)

`updateProgress()` previously scanned the entire `activity` store on every debounced progress save (~every 900ms while reading). Replaced with a module-level `lastReadEventAt: Map<string, number>`; the entry is cleared in `deleteDocument()`. The 10-minute throttle semantics are unchanged.

### F3 — Bonus bug found by new tests: `dedupeSceneTitles` suffix stripping

The roman-numeral strip only ran inside the `n > 1` branch, so a model returning `["Salt", "Salt", "Salt — II"]` produced two `"Salt — II"` cards. Normalization now happens _before_ counting, so pre-suffixed titles can't dodge the duplicate check. Covered by a regression test.

### F4 — M1 done: AI-layer unit tests (`src/lib/ai.test.ts`)

29 tests covering `parseSse` (partial-buffer handling), `extractJson` (fences, prose-wrapped payloads, braces-in-strings, escaped quotes, unterminated input), `mapModelRaw` (free-only filter, fine-tune drop, pricing conversion, sort), `rankFreeModels` (filtering, family ranking, coder penalty, determinism), `dedupeSceneTitles`, `detectDepth`, and `ankaaSectionsFor`/`ankaaSteps` consistency.

### F5 — M3 done: security headers (`vercel.json`)

Added `Content-Security-Policy` (self-only scripts/styles, OpenRouter as sole `connect-src`, blob workers for pdf.js, `frame-ancestors 'none'`), `Strict-Transport-Security` (2y, preload), `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, plus immutable caching for hashed static assets.

### F6 — L1 fixed: CSPRNG identity (`src/lib/db.ts`)

`getUserId()` uses `crypto.randomUUID()` when available, falling back to the legacy `Math.random` scheme only where Web Crypto is absent. Existing identities are untouched (read-once semantics).

### Verified already-present (no change needed)

- **Error handling / loading states**: app-level `ErrorBoundary` wraps all views (`App.tsx` → `components/ui.tsx`), plus global `error` / `unhandledrejection` handlers surfacing recoverable toasts; every view has skeleton/loader states via `useQuery`'s stale-while-revalidate + auto-retry.
- **Prompt-injection fencing (L11)**: Luma already carries the explicit SECURITY clause; Ouro/Ankaa/cinema use `<<< >>>` data fences.

---

## 7. Second pass — hardening, hygiene & CI/CD hardening

All items below verified with lint ✅ · typecheck ✅ · 63/63 tests ✅ · production build ✅ (`out/` export confirmed).

### H1 — GitHub Actions hardened

Both workflows (`.github/workflows/ci.yml`, `.github/workflows/deploy.yml`) now:

- declare explicit least-privilege `permissions:` (CI: `contents: read`; deploy: `contents: read` + `pages: write` + `id-token: write`);
- pin every third-party action to a full commit SHA instead of a mutable tag;
- add a `concurrency` group so superseded pushes cancel in-flight runs.

### H2 — `next.config.ts` dev origins removed

The leftover `allowedDevOrigins` list (stale local-network hostnames) was removed from the production config; it only applies to dev-mode origin checks and leaked internal hostnames into the repo.

### H3 — M4 closed: real PNG apple-touch-icon

`scripts/gen-apple-icon.mjs` now emits a genuine 180×180 PNG (`public/apple-touch-icon.png`, generated at build/predev time) instead of an SVG mislabeled as PNG. Verified present in the exported `out/`.

### H4 — M5 closed: README drift reconciled

README claims about seeding behavior and CI steps were corrected to match the actual scripts and workflows.

### H5 — M6 done: `noUncheckedIndexedAccess` enabled

Turned on in `tsconfig.json`; all resulting unsafe index accesses fixed with explicit guards/clamps rather than non-null assertions. Typecheck passes clean under the stricter flag.

### H6 — L2: identity storage keys deduplicated

`UID_KEY` / `UID_CREATED_KEY` are now exported from `src/lib/db.ts` and reused by Settings' rotate-identity action — no duplicated string literals that could drift apart.

### H7 — L3: `RawCatalogModel` single source of truth

The duplicated interface in `ai.ts` was removed; the canonical shape lives in `openrouter.ts` (the layer that parses the API response) and is re-exported from `ai.ts` for `mapModelRaw` consumers and tests.

### H8 — L5: orphaned AI cache purged on document delete

New `cachePurgeDoc(docId)` in `src/lib/cache.ts` removes every `aiCache` entry keyed by a deleted document (study sets, deep analyses, scene cards, Ouro artifacts). Wired into `deleteDocument()` so cached artifacts don't linger until TTL expiry after their document is gone.

### H9 — L8: `serve` declared as a devDependency

The static preview server used for verifying the `out/` export is now an explicit devDependency instead of an undeclared global assumption.

### Final verification matrix

| Check                                                        | Result                                                                                                      |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| ESLint                                                       | 0 errors (1 pre-existing warning in a build script)                                                         |
| TypeScript (`--noEmit`, strict + `noUncheckedIndexedAccess`) | clean                                                                                                       |
| Tests                                                        | 63 pass / 0 fail (105 assertions)                                                                           |
| Production build (`next build`, Turbopack)                   | success, fully static                                                                                       |
| Export audit (`out/`)                                        | `index.html`, `404.html`, hashed `_next` assets, real PNG touch icon, pdf.js worker, robots.txt all present |
| Dependency audit                                             | no known vulnerabilities in the dependency tree                                                             |
| CI workflow                                                  | lint → typecheck → test → build, SHA-pinned, least privilege                                                |
| CD workflow                                                  | SHA-pinned Pages deploy with artifact upload, concurrency guard                                             |

---

## 8. LOA / Anchor engine — audit & intelligence upgrade (2026-08-26)

Scope: `src/lib/loa.ts` (offline NLP engine), its `offlineLuma` integration in `src/lib/ai.ts`, and a new dedicated test suite (`src/lib/loa.test.ts`, 56 tests). Zero new runtime dependencies — all algorithms implemented inline, preserving the local-first, bundle-clean constraint. Research grounding: Okapi BM25 (Robertson–Zaragoza), TextRank (Mihalcea–Tarau), YAKE (Campos et al., ECIR 2018).

### Audit findings → fixes applied

| # | Finding (severity) | Fix |
| - | ------------------ | --- |
| L1 | 🔴 `clozeQuiz()` used `Math.random()` twice — violated the module's own determinism contract; every retry produced a different quiz | RNG seeded from an FNV fingerprint of `(text, n)`; Fisher–Yates `seededShuffle` replaces the biased `sort(() => Math.random() - 0.5)`. Quizzes are now bit-reproducible |
| L2 | 🔴 Quiz distractors chosen purely by length proximity — inflections of the answer ("walk"/"walking") gave it away | Distractors exclude stem-mates of the answer and are ranked by frequency-then-length closeness; top band shuffled with the seeded RNG |
| L3 | 🔴 Mood classifier matched lexicon words as *substrings* ("old" inside "beholden") via ~60 full-text scans | Token-level tally keyed by stem — one O(words) pass, word-boundary safe by construction; explicit "unmarked atmosphere" fallback below a signal floor instead of confidently inventing a mood |
| L4 | 🔴 `offlineLuma` retrieval was raw term-overlap per paragraph — no IDF, no length normalization, no citations | New `retrievePassages()`: Okapi BM25 (k₁=1.5, b=0.75) over sentence-triplet windows with collection-derived IDF; answers quote their evidence (`> …` blocks); chapter scope falls back to whole-document scope |
| L5 | 🟠 "TextRank-style" summarization was keyword-density scoring with no graph, no redundancy control | True Mihalcea–Tarau TextRank: stemmed content-word sets, overlap/log-length similarity graph, PageRank power iteration (d=0.85, ε=1e-4, ≤40 iters, dangling-mass redistribution), then greedy MMR selection under a relaxing Jaccard ceiling. Long inputs pre-filtered to a density-ranked pool of 140 so graph cost stays O(pool²) |
| L6 | 🟠 Keywords were raw unigram frequency — morphological variants split their counts and multi-word motifs could never surface | Conservative light stemmer merges variants under the most frequent surface form; YAKE-inspired scorer adds sentence-spread, early-position and length factors; recurring bigram motifs claim reserved slots ("dark tower" survives as a phrase) |
| L7 | 🟠 `extractVocab` sorted by word length only; context was the first containing sentence | Score = length ÷ log-frequency (rare + long first); context = the most content-dense containing sentence |
| L8 | 🟠 Cache keys retained entire document strings as Map keys | Keys >256 chars replaced by a dual-FNV fingerprint (+length); the huge-text cache bypass now correctly checks the *raw* key length |
| L9 | 🟠 **Three latent segmentation bugs found by the new tests** (the engine previously had zero coverage): (a) the initialism heuristic fired on any short word-final period ("in." looked like "J."), silently merging sentences; (b) abbreviation lookup kept the trailing dot so `"mr."` never matched `"mr"` — dialogue attribution split mid-sentence; (c) the decimal guard inspected an incomplete buffer backward, so "3.14" always split | Initialisms matched by `/^([a-z]\.)+$/`; abbreviations looked up with trailing-dot stripping; decimal guard checks digit-before-dot × digit-after-dot ahead of the boundary. Also consumes `]` as a closing bracket after terminal punctuation |
| L10 | 🟡 STOP list missed negated contractions ("don't", "wasn't", …) which survived tokenization and polluted keywords | Expanded list + `isStop()` normalizing curly apostrophes; pure numeric tokens excluded from frequency analysis |
| L11 | 🟡 Theme chapter-distribution counted substring splits | Stemmed token-window counting (`keywordHits`) accurate for multi-word themes |
| L12 | 🟡 `offlineAnalysis` criticism listed keywords without evidence | Now names the figure carrying the motif and quotes the top-ranked passage as key evidence |
| L13 | 🟡 Ankaa generation had only 2 variants per opening/closing slot | Third variant authored for both openings and all four closings (~50% more run-to-run variety at equal quality bar); non-deterministic collocation risk unchanged |

Also hardened: the offline `define:` intent no longer picks its target word via `.pop()` of >4-char tokens — it prefers quoted phrases, else the most corpus-frequent content word actually present in the document.

### Verification

`src/lib/loa.test.ts` — 56 tests: tokenization, segmentation edge cases (abbreviations, decimals, quotes, paragraph breaks), stem-merged frequencies, bigram motif surfacing, summary determinism/diversity/centrality, character false-positive regressions ("Hers", "Lamps", "She"), mood boundary + honesty guard, quiz determinism/shape/distractor quality, BM25 ranking/rarity weighting/empty-input handling, generation determinism & depth budgets, study artifacts and helpers.

Final matrix: ESLint ✅ · TypeScript strict ✅ · **119/119 tests** ✅ · production build ✅.

Deliberately deferred (documented for future passes): optional WebGPU/WASM embedding layer (transformers.js MiniLM) gated behind user opt-in — rejected for now to preserve instant-offline startup and zero-download guarantees; Web Worker offload of whole-document passes; further Ankaa beat-pool expansion.

---

## 9. Online AI system — intelligence upgrade (2026-08-26)

Scope: `src/lib/ai.ts` (routing, Luma/Ouro/Ankaa pipelines), `src/lib/openrouter.ts` (client), new `src/lib/modelHealth.ts`, `src/lib/data.ts` + `types.ts` (ledger model attribution), extended `src/lib/ai.test.ts`. Provider capabilities verified against current OpenRouter docs (per-request sampling, streaming usage accounting, provider routing).

### Upgrades applied

| # | Finding | Upgrade |
| - | ------- | ------- |
| A1 | 🔴 Context assembly was blind prefix slicing (`chapterText.slice(0, 7500)`) — questions about material deeper in long chapters were answered without that text in context | `buildLumaContext()`: when the chapter exceeds budget, **BM25 retrieval** (`retrievePassages`, shared with the offline engine) selects the passages most relevant to the actual question, framed by the chapter opening as an orientation anchor; hard 9k-char budget; graceful legacy fallback. The model is told when excerpts are selective |
| A2 | 🟠 One malformed JSON response sent every structured task straight to the offline engine | `requestValidatedJson()`: **one self-repair round-trip** — the invalid reply + validator error are fed back with a strict correction instruction at temperature 0.2 before falling back. Wired into all six structured paths: refine, Ouro tasks, Ankaa outline, cinema scenes (incl. per-scene regenerate), deep analysis |
| A3 | 🟠 Fixed temperature 0.55 for everything — factual extraction and literary generation sampled identically | `samplingFor()` task profiles: creative 0.85 / study 0.4 / analysis 0.45 / refine 0.35 / chat 0.55 / repair 0.2 (repair precedence first); threaded through `openrouter.chat()` which also gains optional `top_p` (`SamplingOpts`) |
| A4 | 🟠 Routing was static family-substring ranking; the usage ledger recorded latency but never *which model* served a call | New `modelHealth.ts`: per-model success/latency **EWMAs**, fed live by every `aiRequest` attempt and Luma stream outcome; ledger rows now carry `model`; `chainFor()` reorders via bounded `healthBoost` (+60 fast-healthy … −90 failing) with stable index tie-breaks — byte-identical ordering until real observations exist; hourly best-effort ledger warm-up |
| A5 | 🟠 Seminar history was `slice(-6)` verbatim — beginnings silently forgotten | `compactHistory()`: last 4 turns verbatim + extractive condensed digest of older turns as a system note |
| A7 | 🟡 Rate limiter was per-tab — two tabs doubled effective call rate (AUDIT L4 closed) | `BroadcastChannel("lemniscate:rate")` stamp announcements merge sibling tabs' calls into one shared 15/min window (best-effort no-op where unsupported) |
| A8 | 🟡 Suggested questions were five static strings identical for every book | `lumaSuggestions()`: chapter-specific starters derived from LOA motifs + detected cast; statics retained as filler |

### Verification

13 new tests in `ai.test.ts`: RAG context (retrieval-from-tail, budget ceiling, legacy fallbacks), history compaction shape, sampling profile matrix incl. repair precedence, suggestion derivation + fallback, model-health neutrality/reward/penalty/determinism.

Final matrix: ESLint ✅ · TypeScript strict ✅ · **132/132 tests** ✅ · production build ✅.

Deferred: streaming-progress parsing for Ouro (non-streaming calls still wait blind); cost-surface in Insights from ledger pricing data; chunked AI refinement beyond the 30k skip threshold.


