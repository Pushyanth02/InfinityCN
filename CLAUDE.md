# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## What this is

Lemniscate transforms uploaded documents (PDF/DOCX/TXT) into structured reading experiences using **deterministic, offline, classical NLP** — regex tokenizers, rule-based segmentation, hand-curated lexicons, and graph analysis.

### Hard constraints (non-negotiable)

> ⚠️ **No AI.** Zero LLMs, AI APIs, or ML models, by design. Any change that adds a neural model or outbound AI call violates the core premise. New "intelligent" behavior belongs in `src/lib/nlp/` lexicons and rule engines — **never** behind an API call or model.

> ⚠️ **Verbatim story text.** In both output modes, every line of *story text* is sourced **verbatim** from the input. Only structural annotations (scene headings, transition cues, classifications) are generated. Never invent characters, events, dialogue, or reorder chronology.

### Status: v2 redesign in progress

The reader and pipeline are mid-rebuild. The newer surfaces are the `src/lib/intelligence/` engine layer (engine → registry → `NovelIntelligenceEngine`) and `src/lib/pipeline/metadata.ts`; `cinematified-v2.test.ts` is their integration harness. Treat these as active development, not final. **Check `git status` / recent commits before assuming any one path is canonical.**

## Commands

Package manager is **Bun** (`bun.lock`); `npm`/`package-lock.json` also work.

```bash
bun install                 # install deps (postinstall runs `prisma generate`)
bun run db:push             # create/sync SQLite schema — run before first dev
bun run dev                 # Next.js app on :3000 (embedded poller runs the pipeline in-process)
bun run build               # production build (Windows-safe: copies static/public into standalone)
bun run start               # run the standalone production server

bun run lint                # eslint
bun run test                # vitest, single pass
bun run test:watch          # vitest watch mode
bunx tsc --noEmit            # typecheck (no dedicated script; tsconfig has noEmit)

# Run a single test file / test name:
bunx vitest run src/lib/nlp/core.test.ts
bunx vitest run -t "detects scene boundary"

# E2E (hits a real DB, writes transcript to e2e-report.txt):
bunx vitest run src/__e2e__/pipeline-e2e.test.ts
```

Optional realtime worker (WebSocket live progress; HTTP polling works without it):

```bash
cd mini-services/lemniscate-worker && bun install && bun run dev   # Socket.IO on :3003
```

Database (Prisma + SQLite): `bun run db:migrate` (dev migration), `bun run db:reset`, `bun run db:generate`. The project uses `db push`, so **there is no migration history yet**.

## Architecture

### The pipeline (the heart of the system)

One deterministic pipeline produces the same output for the same input. Upload → validate → store → **EXTRACT → SEGMENT → ORIGINAL → CINEMATIFY → ANALYZE → FINALIZE**. It lives in `src/lib/pipeline/`:

- `orchestrator.ts` — the stage runner; also builds the `CanonicalDocument` and persists all artifacts to SQLite. **Start here** to understand a job's lifecycle.
- `extract.ts` — PDF (`pdf-parse`, isolated via `pdf-extract-worker.mjs` child process for crash-safety) / DOCX (`mammoth`) / TXT. **Parsers are the only code allowed to know the source format** — downstream stages consume the format-agnostic `CanonicalDocument` (`src/lib/canonical/`).
- `original.ts` — ORIGINAL mode: formatting repair, paragraph reconstruction/classification. Preserves wording and meaning.
- `cinematified.ts` — CINEMATIFIED mode: scene/character/location/event/arc/tension/emotion detection.
- `job-runner.ts` — shared queue logic: `claimNextJob`, `rehydrateStalledJobs`, `executeJobWithRetry`.

The deterministic algorithms and all hand-curated lexicons live in `src/lib/nlp/` (`core.ts`, `characters.ts`, `scenes.ts`, `emotion.ts`, `relationships.ts`, `structure.ts`, `intelligence.ts`, `momentum.ts`, `lexicons.ts`). Tests are co-located (`*.test.ts`). **Change detection behavior here, not in the orchestrator.**

#### Document Intelligence Engine (`src/lib/intelligence/`)

A layer between the `CanonicalDocument` and the cinematified NLP modules: `engine.ts` (interface) → `registry.ts` (per-`documentType` router) → `NovelIntelligenceEngine` (`novel-engine.ts`, the only registered engine today, wraps the cinematified analysis). New document domains (research paper, legal, manual…) register a new engine in the router without touching the orchestrator, persistence, or reader. Today every domain falls through to the novel engine.

### Queue & workers (no external broker)

The queue **is** the SQLite `Job` table — no Redis. A poller selects the highest-priority `QUEUED` row and claims it with an atomic compare-and-set (`updateMany` guarded by `status`), so concurrent pollers can't double-process. Stalled `PROCESSING` jobs are re-queued on boot. Exhausted retries move to `DEAD_LETTER` (recover via `POST /api/jobs/dead-letter`).

Two components can run the pipeline, both using the same `job-runner.ts` CAS logic:

| Component | File | When active |
|---|---|---|
| Embedded poller | `src/lib/pipeline/embedded-poller.ts` | **Default** — started from `src/instrumentation.ts` unless `DISABLE_EMBEDDED_WORKER` is set |
| Standalone worker | `mini-services/lemniscate-worker/index.ts` | Docker Compose — the app sets `DISABLE_EMBEDDED_WORKER=1` |

`REDIS_URL` has **one implemented use today: rate limiting** (`src/lib/middleware/rate-limit.ts` — atomic Lua fixed-window counter, in-memory fallback otherwise). It does **not** touch the job queue: Redis-backed queue coordination / `lemniscate:events` pub-sub for multiple Socket.IO gateways is a reserved, unimplemented seam — don't wire it up without an explicit task. The SQLite CAS queue is the queue regardless of `REDIS_URL`.

### Layered architecture (keep dependency direction one-way)

Business logic never lives in API routes or UI components.

```
API route (src/app/api/**)  →  service (src/lib/services/*.service.ts)  →  provider (src/lib/providers/**) + domain (src/lib/domain/**)
```

- **API routes**: two families coexist. `/api/v1/*` is the current versioned surface — standard response envelope (`src/lib/api/response.ts` → `apiSuccess`/`apiError`), OpenAPI spec at `/api/v1/openapi.json`. The unversioned `/api/*` routes are the older surface. **Add new endpoints under `/api/v1/`.**
- **Services** (`src/lib/services/`): all business logic. Routes validate input, then delegate to a service.
- **Providers** (`src/lib/providers/`): a DI registry (`registry.ts`, wired in `index.ts`) that makes each major capability swappable by env var — `documentParser`, `characterAnalyzer`, `relationshipAnalyzer`, `search`, `storage`, `queue` (opt-in `embedding` has no default implementation yet). All defaults are `deterministic`/`local`/`sqlite`. To add one: implement under `implementations/`, register in `index.ts`, select via the env var. This is the seam for future cloud/Supabase/Postgres/Redis backends **without touching service or route code**.
- Import `'@/lib/providers'` for its registration side-effect at the top of routes/entrypoints that need providers.

Path alias `@/*` → `./src/*` (configured in `tsconfig.json`, `vitest.config.ts`, and the worker's `tsconfig.json`).

### Frontend

Single-page app: `src/app/page.tsx` renders `src/components/lemniscate/app.tsx`, which lazy-routes views (`views/landing|library|processing|reader|characters|scenes|settings.tsx`) based on a **Zustand** store (`store.ts` — navigation, reader prefs, live job progress). `use-realtime.ts` is the Socket.IO hook that patches the progress map; `use-worker-status.ts` probes worker connectivity for the Live/Poll badge; `hooks.ts` holds shared client hook helpers. `components/ui/` is shadcn/ui (Radix). Remote data is fetched directly in components; reading progress and bookmarks are server-persisted via API routes.

### Realtime

Each pipeline stage publishes a `ProgressEvent` to the in-process `EventBus` (`src/lib/events/bus.ts` — 200-event ring buffer per job, ~50 jobs). The worker fans these out to Socket.IO clients subscribed to a `jobId`; late-joiners get replayed history. Browsers connect via `/?XTransformPort=3003` (Caddy routes WS traffic to the worker by that query param).

## Operating rules (how to change this code)

This is an existing, near-production codebase — **not greenfield**.

- **Never rewrite working code without justification.** Prefer incremental improvements; every significant architectural change needs a measurable benefit. Make the smallest safe change; avoid speculative refactoring.
- **Think before editing.** Trace imports, data flow, API contracts, DB and worker interactions, and downstream impact before changing anything. Understand the feature fully first.
- **Preserve repository consistency.** New code matches existing architecture, naming, folder structure, dependency direction, and coding style.
- **Keep logic in the right layer.** Business logic in services, not API routes or UI; parsing in `pipeline/`/`providers/`, not routes; queue logic separate from business logic.
- **Validate every change.** Build, test (`bun run test`), lint (`bun run lint`), and typecheck (`bunx tsc --noEmit`) before considering work done. Security tests in `src/__tests__/security/` must stay green.
- **Error handling.** Never silently ignore exceptions; log meaningfully; return structured responses; never leak stack traces to clients.
- **DB schema changes** need a migration + indexes/constraints/foreign keys. The project uses `db push`, so there is no migration history yet — be deliberate.

## Gotchas

- **SQLite path resolution**: relative `file:` URLs resolve **relative to `prisma/schema.prisma`**, not the project root. So `file:./db/custom.db` (the dev default in `.env`) reads/writes `prisma/db/custom.db`. Docker uses an absolute `file:/app/db/custom.db` on a named volume to avoid the ambiguity. WAL mode is enabled.
- **Authoritative docs**: `README.md` is the source of truth for architecture and methodology. (`AGENTS.md` and `docs/ARCHITECTURE.md` existed in earlier revisions but were removed — don't reference them.) The `.kiro/steering/*.md` files are aspirational design guidance, not ground truth — `devops.md` in particular describes a Postgres/Redis/Nginx topology that is **not** what's implemented (the real stack is SQLite + SQLite-queue + Caddy).
- **Security is enforced centrally**: `src/lib/middleware/` (`security.ts` for API-key + CSRF origin checks, `rate-limit.ts`, `validate-id.ts`, `body-size.ts`). Upload validation checks MIME + extension + magic bytes. In production, `LEMNISCATE_API_KEY` (≥16 chars) is required and checked at startup (`src/lib/env-validation.ts`). Security tests live in `src/__tests__/security/` — keep them green when touching middleware or upload handling.
- **Automated SQLite backups**: on every server boot, `src/instrumentation.ts` calls `startBackupScheduler()` from `src/lib/backup.ts`, which copies the resolved `DATABASE_URL` file to `BACKUP_DIR` (default `./backups`) every `BACKUP_INTERVAL_HOURS` (default 24h), keeping `BACKUP_RETENTION_COUNT` (default 7). This runs in the app process — Docker/worker-only setups get it via the `app` container too. Set the env vars to tune; the scheduler is idempotent.

## Deployment

Docker Compose (`docker-compose.yml`): four services — `app` (Next.js :3000, `DISABLE_EMBEDDED_WORKER=1`), `worker` (:3003, internal-only), `redis` (7-alpine, persistent rate-limit counters via `redis-data` volume; `REDIS_URL=redis://redis:6379`), and `caddy` reverse proxy on :81. Shared `db-data` and `uploads` named volumes. The `redis` service backs **only** rate limiting (`src/lib/middleware/rate-limit.ts`) — it is not a job-queue broker and does not wire up the reserved Redis-backed queue/coordination seam. Vercel path uses `bun run build:vercel` (`prisma generate && next build`). Copy `.env.example` for local setup.
