---
focus: quality
mapped_at: 2026-07-17
last_mapped_commit: v0
---

# Coding Conventions

## Core invariants (from CLAUDE.md — non-negotiable)

1. **No AI.** Zero LLMs, AI APIs, or ML models. New "intelligent" behavior
   belongs in `src/lib/nlp/` lexicons and rule engines — never behind an API
   call or model.
2. **Verbatim story text.** Every line of *story text* in output modes is
   sourced verbatim from input. Only structural annotations (scene headings,
   transition cues, classifications) are generated. Never invent characters,
   events, dialogue, or reorder chronology.

## Layering rules

```
API route (src/app/api/**)
   →  service (src/lib/services/*.service.ts)
       →  provider (src/lib/providers/**) + domain (src/lib/domain/**)
```

- **Business logic never lives in API routes or UI components.** Routes
  validate input, then delegate to a service.
- **Parsing lives in `pipeline/` / `providers/`**, never in routes.
- **Queue logic is separate from business logic** (`job-runner.ts`).
- **Dependency direction is one-way downward.** Services don't import from
  `app/`; providers don't import from services.

## New code must match existing patterns

- Match existing architecture, naming, folder structure, and coding style.
- Prefer incremental improvements over rewrites. Make the smallest safe
  change; avoid speculative refactoring.
- Never rewrite working code without justification — every significant
  architectural change needs a measurable benefit.

## TypeScript style

Driven by `eslint.config.mjs` (Next.js core-web-vitals + TS presets):

- `@typescript-eslint/no-explicit-any` → **warn** (avoid `any`, but allowed).
- `@typescript-eslint/no-unused-vars` → warn, ignoring `_`-prefixed args/vars.
- `prefer-const` → warn; `no-debugger` → warn; `no-unreachable` → warn.
- `no-console` → **off** (logging goes through the structured logger, see below).
- Non-null assertion and `ban-ts-comment` are off (legacy escape hatches).
- Path alias `@/*` → `./src/*` (configured in `tsconfig.json`,
  `vitest.config.ts`, and the worker `tsconfig.json`).

## Logging

Use the structured JSON logger in `src/lib/logger.ts` — not `console.*`:

```ts
import { createLogger } from '@/lib/logger'
const logger = createLogger('pipeline')   // namespaced logger
logger.info('stage complete', { jobId, stage, durationMs })
```

- Never silently ignore exceptions.
- Never leak stack traces to API clients — return structured responses.
- Logs are persisted to the `ProcessingLog` table for the processing
  dashboard's live stream.

## Error handling

- Return structured responses from API routes via `src/lib/api/response.ts`
  (`apiSuccess` / `apiError`).
- Domain errors use the taxonomy in `src/lib/domain/errors.ts`.
- The pipeline catches per-stage failures and records them on the `Job`
  (`status=FAILED`, `error` field) before re-queue/dead-letter.

## Validation

- **Every change must be validated**: `bun run test`, `bun run lint`,
  `bunx tsc --noEmit` before considering work done.
- **Security tests** in `src/__tests__/security/` must stay green when
  touching middleware or upload handling.
- **DB schema changes** need a migration + indexes/constraints/foreign keys.
  The project uses `db push` (no migration history yet) — be deliberate.

## API surface conventions

- **New endpoints go under `/api/v1/`.** The unversioned `/api/*` routes are
  the older legacy surface.
- Use the standard response envelope (`apiSuccess`/`apiError`).
- Validate request input; OpenAPI spec is served at `/api/v1/openapi.json`.

## Frontend conventions

- Single-page app: `src/app/page.tsx` → `src/components/lemniscate/app.tsx`.
- Views are lazy-routed based on the **Zustand** store (`store.ts`).
- Stateful remote data is fetched directly in components; reading progress
  and bookmarks are server-persisted via API routes.
- `components/ui/` is shadcn/ui (Radix) — do not hand-roll primitives that
  exist there.
- Styling: Tailwind 4 + custom warm-parchment OKLCH design tokens
  (`src/app/globals.css`). Use `cn()` (`src/lib/utils.ts`) for class merges.

## Provider extension pattern

To add a new provider backend (from `providers/index.ts`):

1. Implement under `src/lib/providers/implementations/`.
2. Import it in `index.ts` and call `registerProvider(slot, name, factory)`.
3. Users select it via the corresponding environment variable.

Defaults are `deterministic` / `local` / `sqlite`. This is the seam for
future cloud/Supabase/Postgres/Redis backends **without touching service or
route code**.

## Import side-effect convention

`import '@/lib/providers'` is required at the top of routes/entrypoints that
need providers — its mere import registers the defaults (side-effect barrel).
The registration is idempotent (guarded by a `registered` flag).
