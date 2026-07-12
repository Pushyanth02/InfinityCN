# Contributing to Lemniscate

Lemniscate transforms uploaded documents (PDF/DOCX/TXT) into structured reading
experiences using **deterministic, offline, classical NLP** — no AI, no LLMs,
no ML models. Before contributing, read [`CLAUDE.md`](./CLAUDE.md) (the
architectural source of truth) and [`README.md`](./README.md) (methodology).

## The two hard constraints

These are non-negotiable. A change that violates either will not be merged.

1. **No AI.** Zero LLMs, AI APIs, or ML models, by design. Any change that adds
   a neural model or outbound AI call violates the core premise. New
   "intelligent" behavior belongs in `src/lib/nlp/` lexicons and rule engines —
   never behind an API call or model.

2. **Verbatim story text.** Every line of *story text* in both output modes is
   sourced **verbatim** from the input. Only structural annotations (scene
   headings, transition cues, classifications) are generated. Never invent
   characters, events, dialogue, or reorder chronology.

## Development setup

Package manager is **Bun** (`bun.lock`); `npm`/`package-lock.json` also work.

```bash
bun install                 # install deps (postinstall runs `prisma generate`)
bun run db:push             # create/sync SQLite schema — run before first dev
bun run dev                 # Next.js app on :3000
```

Copy `.env.example` to `.env` for local setup. The dev defaults work
out-of-the-box (SQLite at `file:./db/custom.db`, auth disabled in dev).

## Useful commands

```bash
bun run lint                # eslint
bun run test                # vitest, single pass
bun run test:watch          # vitest watch mode
npx tsc --noEmit            # typecheck (no dedicated script)

# Run a single test file / test name:
npx vitest run src/lib/nlp/core.test.ts
npx vitest run -t "detects scene boundary"

# E2E (hits a real DB, writes transcript to e2e-report.txt):
npx vitest run src/__e2e__/pipeline-e2e.test.ts
```

**Validate every change.** Build, test, lint, and typecheck before considering
work done. Security tests in `src/__tests__/security/` must stay green.

## Architecture (dependency direction is one-way)

```
API route (src/app/api/**)  →  service (src/lib/services/*.service.ts)  →  provider (src/lib/providers/**) + domain (src/lib/domain/**)
```

- **Business logic never lives in API routes or UI components.** Routes
  validate input, then delegate to a service. Parsing lives in
  `pipeline/`/`providers/`, not routes. Queue logic is separate from business
  logic.
- **The pipeline is the heart of the system.** One deterministic pipeline
  produces the same output for the same input:
  `EXTRACT → SEGMENT → ORIGINAL → CINEMATIFY → ANALYZE → FINALIZE`. It lives in
  `src/lib/pipeline/`. Start at `orchestrator.ts` to understand a job's
  lifecycle. Change detection behavior in `src/lib/nlp/` — **not** in the
  orchestrator.
- **Providers are a DI registry** (`src/lib/providers/`) that makes each major
  capability swappable by env var. All defaults are `deterministic`/`local`/
  `sqlite`. To add one: implement under `implementations/`, register in
  `index.ts`, select via the env var. This is the seam for future cloud backends
  **without touching service or route code**.
- **New endpoints go under `/api/v1/`.** The unversioned `/api/*` routes are the
  older surface. Use the standard response envelope (`apiSuccess`/`apiError`
  from `src/lib/api/response.ts`).

## Operating rules

This is an existing, near-production codebase — **not greenfield**.

- **Never rewrite working code without justification.** Prefer incremental
  improvements; every significant architectural change needs a measurable
  benefit. Make the smallest safe change; avoid speculative refactoring.
- **Think before editing.** Trace imports, data flow, API contracts, DB and
  worker interactions, and downstream impact before changing anything.
- **Preserve repository consistency.** New code matches existing architecture,
  naming, folder structure, dependency direction, and coding style.
- **Error handling.** Never silently ignore exceptions; log meaningfully;
  return structured responses; never leak stack traces to clients.
- **DB schema changes** need a migration + indexes/constraints/foreign keys.
  The project uses `db push`, so there is no migration history yet — be
  deliberate.

## Gotchas

- **SQLite path resolution**: relative `file:` URLs resolve **relative to
  `prisma/schema.prisma`**, not the project root. So `file:./db/custom.db`
  reads/writes `prisma/db/custom.db`. Docker uses an absolute
  `file:/app/db/custom.db` to avoid the ambiguity.
- **`README.md` is the source of truth** for architecture and methodology.
  `AGENTS.md` and `docs/ARCHITECTURE.md` existed in earlier revisions but were
  removed — don't reference them.
- **Security is enforced centrally** in `src/lib/middleware/` (`security.ts` for
  API-key + CSRF origin checks, `rate-limit.ts`, `validate-id.ts`, `body-size.ts`).
  Keep security tests in `src/__tests__/security/` green when touching middleware
  or upload handling.

## Committing

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
  (e.g. `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).
- Do not commit per-developer tooling configs (`.claude/`, `.kiro/`, `.agents/`,
  `agent-ctx/`). These are gitignored.
- Do not commit real `.env` files, SQLite `.db` files, `node_modules`, or build
  output — the `.gitignore` already excludes these.

## Reporting security issues

See [`SECURITY.md`](./SECURITY.md).
