# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Lemniscate transforms uploaded documents (PDF/DOCX/TXT) into structured reading experiences using **deterministic, offline, classical NLP** — regex tokenizers, rule-based segmentation, hand-curated lexicons, and graph analysis. **There are zero LLMs, AI APIs, or ML models, by design.** This is a hard product constraint, not a limitation to fix: any change that adds a neural model or outbound AI call violates the core premise. New "intelligent" behavior belongs in `src/lib/nlp/` lexicons and rule engines.

Related hard constraint: in both output modes, every line of *story text* is sourced **verbatim** from the input. Only structural annotations (scene headings, transition cues, classifications) are generated. Never invent characters, events, dialogue, or reorder chronology.

## Commands

Package manager is **Bun** (`bun.lock`), though `npm`/`package-lock.json` also work. Scripts:

```bash
bun install                 # install deps (postinstall runs `prisma generate`)
bun run db:push             # create/sync SQLite schema (run before first dev)
bun run dev                 # Next.js app on :3000 (embedded poller runs the pipeline in-process)
bun run build               # production build (Windows-safe: copies static/public into standalone)
bun run start               # run the standalone production server

bun run lint                # eslint
bun run test                # vitest, single pass
bun run test:watch          # vitest watch mode
npx tsc --noEmit            # typecheck (no dedicated script; tsconfig has noEmit)

# Run a single test file / test name:
npx vitest run src/lib/nlp/core.test.ts
npx vitest run -t "detects scene boundary"

# The E2E test hits a real DB and writes a transcript to e2e-report.txt:
npx vitest run src/__e2e__/pipeline-e2e.test.ts
```

The optional realtime worker (adds WebSocket live progress; HTTP polling works without it):

```bash
cd mini-services/lemniscate-worker && bun install && bun run dev   # Socket.IO on :3003
```

Database (Prisma + SQLite): `bun run db:migrate` (dev migration), `bun run db:reset`, `bun run db:generate`. Note: the project uses `db push`, so **there is no migration history yet**.

## The pipeline (the heart of the system)

Everything flows through one deterministic pipeline that produces the same output for the same input. Upload → validate → store → **EXTRACT → SEGMENT → ORIGINAL → CINEMATIFY → ANALYZE → FINALIZE**. It lives in `src/lib/pipeline/`:

- `orchestrator.ts` — the stage runner; also builds the `CanonicalDocument` and persists all artifacts to SQLite. Start here to understand a job's lifecycle.
- `extract.ts` — PDF (`pdf-parse`, isolated via `pdf-extract-worker.mjs` child process for crash-safety) / DOCX (`mammoth`) / TXT. **Parsers are the only code allowed to know the source format** — downstream stages consume the format-agnostic `CanonicalDocument` (`src/lib/canonical/`).
- `original.ts` — ORIGINAL mode: formatting repair, paragraph reconstruction/classification. Preserves wording and meaning.
- `cinematified.ts` — CINEMATIFIED mode: scene/character/location/event/arc/tension/emotion detection.
- `job-runner.ts` — shared queue logic: `claimNextJob`, `rehydrateStalledJobs`, `executeJobWithRetry`.

The deterministic algorithms and all hand-curated lexicons live in `src/lib/nlp/` (`core.ts`, `characters.ts`, `scenes.ts`, `emotion.ts`, `relationships.ts`, `structure.ts`, `intelligence.ts`, `momentum.ts`, `lexicons.ts`). Tests are co-located (`*.test.ts`). Change detection behavior here, not in the pipeline orchestrator.

## Queue & workers (no external broker)

The queue **is** the SQLite `Job` table — no Redis. A poller selects the highest-priority `QUEUED` row and claims it with an atomic compare-and-set (`updateMany` guarded by `status`), so concurrent pollers can't double-process. Stalled `PROCESSING` jobs are re-queued on boot. Exhausted retries move to `DEAD_LETTER` (recover via `POST /api/jobs/dead-letter`).

Two components can run the pipeline, both using the same `job-runner.ts` CAS logic:

| Component | File | When active |
|---|---|---|
| Embedded poller | `src/lib/pipeline/embedded-poller.ts` | **Default** — started from `src/instrumentation.ts` unless `DISABLE_EMBEDDED_WORKER` is set |
| Standalone worker | `mini-services/lemniscate-worker/index.ts` | Docker Compose — the app sets `DISABLE_EMBEDDED_WORKER=1` |

`REDIS_URL` is reserved for future horizontal scaling and is **not implemented** — don't wire it up without an explicit task.

## Layered architecture

Keep the dependency direction one-way; do not put business logic in API routes or UI components.

```
API route (src/app/api/**)  →  service (src/lib/services/*.service.ts)  →  provider (src/lib/providers/**) + domain (src/lib/domain/**)
```

- **API routes**: two families coexist. `/api/v1/*` is the current versioned surface — standard response envelope (`src/lib/api/response.ts` → `apiSuccess`/`apiError`), OpenAPI spec at `/api/v1/openapi.json`. The unversioned `/api/*` routes are the older surface. **Add new endpoints under `/api/v1/`.**
- **Services** (`src/lib/services/`): all business logic. Routes should validate input, then delegate to a service.
- **Providers** (`src/lib/providers/`): a DI registry (`registry.ts`, wired in `index.ts`) that makes each major capability swappable by env var — `documentParser`, `narrativeAnalyzer`, `characterAnalyzer`, `relationshipAnalyzer`, `storage`, `queue`, plus opt-in `embedding`/`search`. All defaults are `deterministic`/`local`/`sqlite`. To add one: implement under `implementations/`, register in `index.ts`, select via the env var. This is the seam intended for future cloud/Supabase/Postgres/Redis backends **without touching service or route code**.
- Import `'@/lib/providers'` for its registration side-effect at the top of routes/entrypoints that need providers.

Path alias `@/*` → `./src/*` (configured in `tsconfig.json`, `vitest.config.ts`, and the worker's `tsconfig.json`).

## Frontend

Single-page app: `src/app/page.tsx` renders `src/components/lemniscate/app.tsx`, which lazy-routes views (`views/landing|library|processing|reader|characters|scenes|settings.tsx`) based on a **Zustand** store (`components/lemniscate/store.ts` — navigation, reader prefs, live job progress). `use-realtime.ts` is the Socket.IO hook that patches the progress map; `use-worker-status.ts` probes worker connectivity for the Live/Poll badge. `components/ui/` is shadcn/ui (Radix). Remote data is fetched directly in components; reading progress and bookmarks are server-persisted via API routes.

## Realtime

Each pipeline stage publishes a `ProgressEvent` to the in-process `EventBus` (`src/lib/events/bus.ts` — 200-event ring buffer per job, ~50 jobs). The worker fans these out to Socket.IO clients subscribed to a `jobId`; late-joiners get replayed history. Browsers connect via `/?XTransformPort=3003` (Caddy routes WS traffic to the worker by that query param).

## Gotchas

- **SQLite path resolution**: relative `file:` URLs resolve **relative to `prisma/schema.prisma`**, not the project root. So `file:./db/custom.db` (the dev default in `.env`) reads/writes `prisma/db/custom.db`. Docker uses an absolute `file:/app/db/custom.db` on a named volume to avoid the ambiguity. WAL mode is enabled.
- **Two source-of-truth doc sets**: `README.md`, `docs/ARCHITECTURE.md`, and `AGENTS.md` are **authoritative and current** — read `docs/ARCHITECTURE.md` for deep detail. The `.kiro/steering/*.md` files are aspirational design guidance; `devops.md` in particular describes a Postgres/Redis/Nginx topology that is **not** what's implemented (the real stack is SQLite + SQLite-queue + Caddy). Don't treat Kiro steering as ground truth for the stack.
- Security is enforced centrally: `src/lib/middleware/` (`security.ts` for API-key + CSRF origin checks, `rate-limit.ts`, `validate-id.ts`, `body-size.ts`). Upload validation checks MIME + extension + magic bytes. In production, `LEMNISCATE_API_KEY` (≥16 chars) is required and checked at startup (`src/lib/env-validation.ts`).
- Security tests live in `src/__tests__/security/`; keep them green when touching middleware or upload handling.

## Deployment

Docker Compose (`docker-compose.yml`): `app` (Next.js :3000, `DISABLE_EMBEDDED_WORKER=1`), `worker` (:3003), and `caddy` reverse proxy, sharing a `db-data` volume. Vercel path uses `bun run build:vercel` (`prisma generate && next build`). Copy `.env.example` for local setup.
