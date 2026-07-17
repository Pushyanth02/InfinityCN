# Codebase Map: Architecture

> **Last mapped:** 2026-07-17
> **Scope:** full repo (branch `v0`)

## Pattern

Lemniscate is a **Next.js 16 App Router** monolith with a deterministic document-processing pipeline. The defining architectural trait: a strict, one-way **layered architecture** where business logic never lives in API routes or UI components.

```
API route (src/app/api/**) → service (src/lib/services/*.service.ts) → provider (src/lib/providers/**) + domain (src/lib/domain/**)
```

Two API surfaces coexist:
- **`/api/v1/*`** — current versioned surface. Standard response envelope (`src/lib/api/response.ts` → `apiSuccess`/`apiError`), request validation, OpenAPI spec at `/api/v1/openapi.json`, metrics. New endpoints go here.
- **`/api/*`** (unversioned) — the older legacy surface.

## The pipeline (the heart of the system)

One deterministic pipeline produces identical output for identical input. Stages: Upload → validate → store → **EXTRACT → SEGMENT → ORIGINAL → CINEMATIFY → ANALYZE → FINALIZE**. Lives in `src/lib/pipeline/`:

- **`orchestrator.ts`** — the stage runner; builds the `CanonicalDocument` and persists all artifacts to SQLite. **Start here** to understand a job's lifecycle.
- **`extract.ts`** — PDF (`pdf-parse`, isolated via `pdf-extract-worker.mjs` child process for crash-safety) / DOCX (`mammoth`) / TXT. **Parsers are the only code that knows the source format** — downstream stages consume the format-agnostic `CanonicalDocument`.
- **`original.ts`** — ORIGINAL mode: formatting repair, paragraph reconstruction/classification. Verbatim text.
- **`cinematified.ts`** — CINEMATIFIED mode: scene/character/location/event/arc/tension/emotion detection. Verbatim story text; only structural annotations generated.
- **`job-runner.ts`** — shared queue logic: `claimNextJob`, `rehydrateStalledJobs`, `executeJobWithRetry`.
- **`embedded-poller.ts`** — in-process job poller (started from `src/instrumentation.ts` unless `DISABLE_EMBEDDED_WORKER=1`).
- **`pdf-extract-worker.mjs`** — isolated PDF child process for crash-safety.

### Document Intelligence Engine (`src/lib/intelligence/`)

A layer between the `CanonicalDocument` and the cinematified NLP modules:

- `engine.ts` (interface) → `registry.ts` (per-`documentType` router) → `NovelIntelligenceEngine` (`novel-engine.ts`, the only registered engine today; wraps the cinematified analysis).
- **New document domains** (research paper, legal, manual…) register a new engine in the router **without touching the orchestrator, persistence, or reader**. Today every domain falls through to the novel engine.

This is a key architectural insight: the "novel analysis" is *one module* of a broader engine layer, not the whole platform. The v2 redesign (`cinematified-v2.test.ts`, `metadata.ts`) is the active development harness.

## Canonical model

**`src/lib/canonical/`** — the `CanonicalDocument`: the single normalized model every parser produces and every downstream stage consumes. This decoupling means format-specific logic is fully contained in parsers.

## Queue & workers (no external broker)

The queue **is** the SQLite `Job` table — no Redis for jobs. A poller selects the highest-priority `QUEUED` row and claims it with an atomic compare-and-set (`updateMany` guarded by `status`), so concurrent pollers can't double-process. Stalled `PROCESSING` jobs re-queue on boot. Exhausted retries move to `DEAD_LETTER`.

Two components can run the pipeline, both using the same `job-runner.ts` CAS logic:

| Component | File | When active |
|---|---|---|
| Embedded poller | `src/lib/pipeline/embedded-poller.ts` | **Default** — started from `src/instrumentation.ts` unless `DISABLE_EMBEDDED_WORKER` is set |
| Standalone worker | `mini-services/lemniscate-worker/index.ts` | Docker Compose — the app sets `DISABLE_EMBEDDED_WORKER=1` |

**`REDIS_URL` has one implemented use: rate limiting** (`src/lib/middleware/rate-limit.ts` — atomic Lua fixed-window counter, in-memory fallback). It does **not** touch the job queue. Redis-backed queue coordination / `lemniscate:events` pub-sub for multiple Socket.IO gateways is a **reserved, unimplemented seam** — do not wire it up without an explicit task.

## Provider seams (`src/lib/providers/`)

A DI registry (`registry.ts`, wired in `index.ts`) that makes each major capability swappable by env var:

| Slot | Default impl | File |
|---|---|---|
| `documentParser` | `deterministic` | `deterministic-document-parser.ts` |
| `characterAnalyzer` | `deterministic` | `deterministic-character-analyzer.ts` |
| `relationshipAnalyzer` | `deterministic` | `deterministic-relationship-analyzer.ts` |
| `search` | `deterministic` | `deterministic-search.ts` |
| `storage` | `local` | `local-storage.ts` (lazy-imported) |
| `queue` | `sqlite` | `sqlite-queue.ts` |
| `embedding` | *(opt-in, no default)* | — |
| `auth` | *(unimplemented extension point)* | — |

This is the seam for future cloud/Supabase/Postgres/Redis backends **without touching service or route code**. Import `'@/lib/providers'` for its registration side-effect at the top of routes/entrypoints that need providers.

## Services layer (`src/lib/services/`)

Owns business logic; API routes stay thin. Files: `analytics.service.ts`, `character.service.ts`, `document.service.ts`, `export.service.ts`, `job.service.ts`, `narrative.service.ts`, `persistence.service.ts`, `processing.service.ts`, `relationship.service.ts`, `scene.service.ts`, `search.service.ts`.

## Data flow

1. User uploads → `POST /api/documents/upload`
2. Next.js stores file, hashes it, creates `Document` + `Job` (`QUEUED`) in SQLite
3. Worker/poller polls for `QUEUED` jobs every 800ms, atomically claims one (CAS)
4. Pipeline runs: EXTRACT → SEGMENT → ORIGINAL → CINEMATIFY → FINALIZE
5. Each stage publishes `ProgressEvent`s to the in-process `EventBus` (`src/lib/events/bus.ts` — 200-event ring buffer per job, ~50 jobs)
6. Worker fans events out to Socket.IO clients subscribed to that `jobId`; late-joiners get replayed history
7. Browser processing dashboard renders live progress + logs
8. On completion, user opens narrative viewer (Original or Cinematified)

## Frontend

Single-page app: `src/app/page.tsx` → `src/components/lemniscate/app.tsx` (lazy-routes views: `landing|library|processing|reader|characters|scenes|settings.tsx`) based on a **Zustand** store (`store.ts`). `use-realtime.ts` = Socket.IO progress hook; `use-worker-status.ts` = worker connectivity probe (Live/Poll badge). `components/ui/` = shadcn/ui (Radix). Remote data fetched directly in components; reading progress + bookmarks server-persisted via API routes.

## Realtime

Each pipeline stage publishes a `ProgressEvent` to the in-process `EventBus`. The worker fans these out to Socket.IO clients subscribed to a `jobId`. Browsers connect via `/?XTransformPort=3003` (Caddy routes WS traffic to the worker by that query param).

## Entry points

- **App server:** `bun run dev` → Next.js on :3000 (`src/app/`). `src/instrumentation.ts` runs at boot: env validation → register providers → `startBackupScheduler()` → `startEmbeddedPoller()` (unless `DISABLE_EMBEDDED_WORKER=1`).
- **Standalone worker:** `mini-services/lemniscate-worker/index.ts` → Socket.IO + poller on :3003.
- **Edge middleware:** `src/middleware.ts` (pass-through), `src/proxy.ts`.

## Dependency direction (one-way, enforced by convention)

```
API route → service → provider (DI) + domain
                ↓
            pipeline (orchestrator → extract/original/cinematified → nlp)
                ↓
            CanonicalDocument + Prisma (SQLite)
```

NLP change-detection behavior lives in `src/lib/nlp/` — **never** in the orchestrator.

## Architectural notes / gotchas

- **SQLite path resolution:** relative `file:` URLs resolve relative to `prisma/schema.prisma`, not the project root. So `file:./db/custom.db` (dev default) reads/writes `prisma/db/custom.db`. Docker uses absolute `file:/app/db/custom.db` on a named volume.
- **WAL mode** is enabled on SQLite.
- **PDF isolation:** `pdf-parse` runs in a child process (`pdf-extract-worker.mjs`) so a malformed PDF crashes the child, not the worker.
- **Storage provider lazy-import:** `local-storage` is dynamically imported to avoid Turbopack NFT tracing the dynamic path operations at build time.
- **`.kiro/steering/devops.md`** describes a Postgres/Redis/Nginx topology that is **not** implemented (real stack is SQLite + SQLite-queue + Caddy). Treat `.kiro/steering/*.md` as aspirational, not ground truth.
