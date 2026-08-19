# Lemniscate

> A local-first AI reading room where documents become living, interactive experiences.

Books, papers, documents and stories become chapter-aware, readable experiences with three companions in the margins — **Luma** (conversation), **Ouro** (study), and **Ankaa** (long-form writing). Everything runs on your device; a key only ever sharpens the companions.

---

## Quick start

```bash
bun install
bun run dev        # http://localhost:3000
```

That's it — no database, no API keys, no server configuration. The app is fully functional on first launch with two sample texts seeded into your local library.

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Start the dev server on port 3000 |
| `bun run build` | Production build (static export to `out/`) |
| `bun run lint` | ESLint (0 errors, 0 warnings expected) |
| `bun run typecheck` | TypeScript strict type-check |
| `bun run deploy` | Deploy to Vercel (`vercel --prod`) |

## Requirements

- **Runtime**: [Bun](https://bun.sh) `>= 1.1` (or Node.js `>= 20`)
- **Next.js**: `16.x`
- **React**: `19.x`
- **Browser**: Any evergreen browser with IndexedDB + Web Workers support

## Architecture

Lemniscate is a **local-first** single-page application. The "server" responsibilities of a traditional reading platform — parsing, persistence, security isolation, quotas — run on-device against IndexedDB. Your texts never leave the browser.

```
src/
  app/                    Next.js App Router (layout, page, globals.css)
    layout.tsx            Root layout: fonts, metadata, viewport
    page.tsx              Client-only dynamic import of <App/>
    globals.css           "Vellum & Ember" design system (Tailwind v4 @theme)
  App.tsx                 Root client component: nav, routing, ambient, toasts
  lib/
    types.ts              Shared domain types (no `any`)
    db.ts                 IndexedDB layer + anonymous session identity
    data.ts               Ownership-filtered queries/mutations + reactive hooks
    engine.ts             Ingestion: detect → parse → clean → chapters → score
    engine-adapters.ts    Code-split PDF (pdf.js) / EPUB + DOCX + PPTX (JSZip) adapters
    openrouter.ts          Direct browser → OpenRouter client (no server proxy)
    ai.ts                 Meridian model orchestrator + Anchor offline engine:
                          SSE streaming, retries, fallbacks, rate-limit queue,
                          daily quota, usage ledger, extractive NLP fallback
    cache.ts              TTL response cache in IndexedDB
    jobs.ts               Background job runner: queue, concurrency, ETA, crash recovery
    store.ts              Zustand: navigation, preferences (persisted), toasts
    seed.ts               First-run sample texts
    utils.ts              Cover gradients, formatters, helpers
  components/
    ui.tsx                Primitives: Button, Dialog, Sheet, Menu, Tabs, Toast, Reveal…
    brand.tsx             Lemniscate mark, particle field, ambient glows
    bits.tsx              Cover art, activity lines, stat tiles
    header.tsx            App header + ⌘K search overlay + job tray
  views/
    Landing / Dashboard / Library / Upload / Reader (+ReaderPanels) /
    Create (Ankaa desk) / Insights (analytics+history) / Settings / Account
```

### Persistence

All records live in IndexedDB (`lemniscate` database) stamped with a locally generated anonymous identity; every read filters by that identity. Export everything or clear it from **Settings → Import & storage**. Deleting a document cascades to its bookmarks, annotations, scenes and jobs.

### Import pipeline

`validateFile` checks extension → size → MIME → **magic bytes** (never trusts the client MIME alone). Parsers: PDF via pdf.js text layers (font-size heading heuristics), EPUB via container→OPF→spine walk, DOCX via `word/document.xml` heading styles, PPTX via `ppt/slides/slideN.xml` text extraction (each slide becomes a chapter), Markdown headings, HTML via readable-content extraction, TXT with Project Gutenberg boilerplate stripping.

### Reader

Chapter navigation (Alt+←/→), debounced progress persistence with resume, bookmarks (`b`), select-to-annotate with color + note, focus mode, cinematic scene view (`s`), in-document search (`/`), Luma/Ouro drawer (`l`), index (`t`), and persisted typography: eight faces, size/line-height/spacing/measure, Light/Dark/Sepia themes.

### Companions

- **Luma** streams answers token-by-token (SSE) with a stop button, regenerate, and markdown-lite rendering. Offline mode answers from the document via extractive retrieval.
- **Ouro** builds seminar-grade study sets — objectives, summary, guide, themes, characters, vocabulary, a sourced quiz, flashcards, essay prompts — validated with Zod and cached 7 days per document revision.
- **Ankaa** writes long-form (~2,500 words online, ~1,800 offline) as a **background job**: queued, concurrent-limited, with live steps, word count and ETA.

## AI configuration (BYOK)

Lemniscate is local-first. Online AI is BYOK: users bring their own OpenRouter key, and the browser talks directly to OpenRouter. Anchor keeps the core reading workflow alive without AI.

**No server-side environment variables are required.** There is no `/api/ai` or `/api/models` proxy. The browser calls `https://openrouter.ai` directly.

To enable online AI:
1. Open **Settings → AI companions**
2. Paste your OpenRouter API key (`sk-or-v1-...`) or import a `.txt`/`.env`/`.json` file containing it
3. The key is stored in memory only (session-scoped) — closing the tab removes it
4. **Meridian** (the model orchestrator) fetches the live free-model catalog and routes each request to the best free model
5. **Anchor** (the offline engine) takes over instantly if the key is missing, the network is down, or the request fails

Get a key at [openrouter.ai/keys](https://openrouter.ai/keys). Never use a management key. Never commit the key to Git.

## Design system

The "Vellum & Ember" design system is defined entirely in [`src/app/globals.css`](./src/app/globals.css) using Tailwind CSS v4's `@theme` directive:

- **Ink** — warm near-black backgrounds (`ink-950` → `ink-500`)
- **Mist** — warm parchment-tinted neutrals (`mist-100` → `mist-700`)
- **Gold** — rich amber accent (`gold-200` → `gold-800`), routed through CSS custom properties so a single `data-accent` attribute on the root retints the entire UI
- **Companion accents** — Ouro (indigo), Ankaa (ember), Ok (moss)
- **Reader themes** — independent Light/Dark/Sepia scoped to `.reader-scope`

## Deployment

### Vercel (recommended)

Lemniscate is preconfigured for instant deployment on [Vercel](https://vercel.com).

#### Option 1: Vercel CLI
1. Install Vercel CLI: `npm install -g vercel` (or `bun add -g vercel`)
2. Deploy to production:
   ```bash
   bun run deploy
   ```

#### Option 2: Git Integration
1. Push your repository to GitHub / GitLab / Bitbucket.
2. Import the repository in the [Vercel Dashboard](https://vercel.com/new).
3. Vercel automatically detects Next.js, executes `next build`, and deploys with optimized static caching and security headers via `vercel.json`.

The app is client-rendered (the root `page.tsx` uses `next/dynamic` with `ssr: false` because it depends on IndexedDB/localStorage). There are no backend API routes — all AI calls go directly from the browser to OpenRouter. No server-side environment variables are required.

### Other static platforms

Any static host that can serve the `out/` directory works (the app is a fully client-side static export). Run `bun run build` then serve the `out/` folder with any static file server (e.g. `npx serve out`).

## Security

Lemniscate is local-first and client-only. There is NO server-side AI proxy, no server-side API key, and no server-side environment variable for OpenRouter.

**Privacy model:**
- **Local Only (no key):** documents and analysis stay in the browser. Anchor runs all extractive NLP on-device via IndexedDB.
- **Online AI (key set):** relevant source text is sent directly from the browser to OpenRouter using the user's key. Lemniscate itself does NOT proxy or store AI requests.

**API key handling:**
- The OpenRouter key is stored in memory only (session-scoped) — never in localStorage, IndexedDB, or server environment variables.
- Closing the browser tab removes the key.
- It is sent directly to `openrouter.ai` over HTTPS in the `Authorization: Bearer` header.
- It is never logged, never included in error messages, never in URLs, and never included in exported app data.
- The key is never displayed in full after submission — only a masked version (`sk-or-v1••••••`) is shown.

**File upload safety:**
- Uploaded files are validated by extension, MIME type, and magic bytes (never trusts MIME alone).
- Size limits are enforced (configurable in Settings → Import).
- PDF/EPUB/DOCX/PPTX parsing runs client-side via pdf.js and JSZip — no server roundtrip.
- Parsed text is treated as untrusted: it is never `eval`'d, never rendered with `dangerouslySetInnerHTML`, and AI prompts use delimiter-fenced `<<<text>>>` wrappers to reduce prompt-injection risk.

**AI prompt injection resistance:**
- Anchor is naturally resistant — it's extractive only (no model, no instruction following).
- Online mode uses system-prompt framing to ground responses in the document.
- User content is placed in the `user` role, never the `system` role.
- Imported document text is treated as hostile/untrusted content for prompt-injection purposes.

## License

Private project.
