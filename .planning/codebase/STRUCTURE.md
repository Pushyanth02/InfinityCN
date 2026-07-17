---
focus: arch
mapped_at: 2026-07-17
last_mapped_commit: v0
---

# Directory Structure

## Top-level layout

```
Lemniscate/
├── src/                       # Next.js application + all business logic
├── mini-services/
│   └── lemniscate-worker/     # standalone Bun Socket.IO worker (:3003)
├── prisma/
│   ├── schema.prisma          # data model (14 models)
│   └── db/                    # SQLite database files (dev) — gitignored
├── db/                        # legacy/alt SQLite location
├── scripts/                   # one-off maintenance scripts
├── public/                    # static assets
├── .github/workflows/         # CI: lint/test, Docker build, CodeQL, APIsec
├── docker-compose.yml         # app + worker + redis + caddy
├── Dockerfile                 # multi-stage Next.js build (non-root)
├── Dockerfile.worker          # standalone worker image
├── Caddyfile                  # reverse proxy, WS routing by ?XTransformPort
├── next.config.ts             # standalone output, NFT root pin, webpack build
├── vitest.config.ts           # test + coverage config (@ alias)
├── eslint.config.mjs          # next core-web-vitals + TS rules
└── package.json               # Bun workspace root
```

## `src/` internal structure

The application code is organized strictly by **layer** (not by feature), and dependency direction is one-way downward:

```
src/
├── app/                       # Next.js App Router
│   ├── api/                   # REST endpoints — THIN, delegate to services
│   │   ├── documents/         # upload, list, detail, delete
│   │   ├── jobs/              # status, logs, dead-letter
│   │   ├── narratives/        # narrative + export, search, progress, bookmarks
│   │   ├── reading-progress/
│   │   ├── sample/            # built-in sample story
│   │   ├── stats/             # dashboard aggregates
│   │   ├── health/            # liveness + DB check
│   │   └── v1/                # versioned API + metrics + openapi.json
│   ├── globals.css            # design system (OKLCH tokens)
│   ├── layout.tsx
│   └── page.tsx               # SPA shell → renders <LemniscateApp/>
│
├── components/
│   ├── ui/                    # shadcn/ui (Radix primitives)
│   └── lemniscate/            # app components
│       ├── shell/             # header.tsx, footer.tsx
│       ├── views/             # landing, library, processing, reader,
│       │                      #   characters, scenes, settings
│       ├── app.tsx            # root — lazy view routing on Zustand store
│       ├── store.ts           # Zustand: navigation, reader prefs, progress
│       ├── logo.tsx           # InfinityMark / InfinityFlow / InfinityHero
│       ├── theme-provider.tsx # next-themes wrapper
│       ├── use-realtime.ts    # Socket.IO progress hook
│       └── use-worker-status.ts
│
├── hooks/                     # shared React hooks (use-mobile, use-toast)
│
├── lib/                       # ★ all business logic lives here
│   ├── db.ts                  # Prisma client (SQLite, WAL)
│   ├── types.ts               # shared types (ProgressEvent, PipelineStage…)
│   ├── utils.ts               # cn() class merge
│   ├── motion.ts              # Framer Motion variants/springs
│   ├── logger.ts              # structured JSON logger
│   ├── env-validation.ts      # startup env checks
│   ├── backup.ts              # scheduled SQLite backup
│   ├── storage/index.ts       # local file storage
│   ├── events/bus.ts          # in-process EventBus (ring buffer)
│   ├── middleware/            # security, rate-limit, validate-id, body-size
│   ├── canonical/             # CanonicalDocument model + builder
│   ├── domain/                # entities, enums, error taxonomy
│   ├── services/              # ★ business logic (document, job, search…)
│   ├── providers/             # ★ pluggable seams (DI registry)
│   │   ├── registry.ts
│   │   ├── index.ts           # registers defaults on import (side-effect)
│   │   ├── types.ts           # provider interfaces
│   │   └── implementations/   # deterministic*/local/sqlite impls
│   ├── intelligence/          # Document Intelligence Engine + router
│   ├── api/                   # response envelope, request validation, OpenAPI
│   ├── nlp/                   # ★ deterministic NLP engines + lexicons
│   │   ├── core.ts            # tokenize, splitSentences, POS-lite
│   │   ├── lexicons.ts        # AFINN, Plutchik, gazetteers
│   │   └── *.ts               # characters, scenes, emotion, momentum…
│   └── pipeline/              # ★ the deterministic pipeline
│       ├── orchestrator.ts
│       ├── extract.ts
│       ├── original.ts
│       ├── cinematified.ts
│       ├── metadata.ts
│       ├── job-runner.ts
│       ├── embedded-poller.ts
│       └── pdf-extract-worker.mjs   # isolated PDF child process
│
├── instrumentation.ts         # Next.js startup hook
├── proxy.ts / middleware.ts   # edge pass-through
│
├── __e2e__/                   # end-to-end tests (live DB)
├── __tests__/                 # unit/integration/security tests
│   └── security/              # ★ security tests — keep green
└── __fixtures__/              # test fixtures
```

## Naming conventions

- **Files**: `kebab-case.ts` for modules; `*.test.ts` co-located with source.
- **Components**: `PascalCase.tsx` (e.g., `theme-provider.tsx` exports `ThemeProvider`).
- **Tests**: `<module>.test.ts` sitting next to `<module>.ts`.
- **Interfaces**: `IFoo` prefix for provider contracts (`IDocumentParser`, `IStorageProvider`).
- **Enums**: `SCREAMING_SNAKE` members (job `status`, paragraph `type`, etc.) — stored as strings in SQLite.
- **Provider slots**: lowercase nouns — `documentParser`, `characterAnalyzer`, `search`, `storage`, `queue`, `relationshipAnalyzer`.

## Key locations cheat sheet

| Looking for… | Go to |
|---|---|
| Job lifecycle | `src/lib/pipeline/orchestrator.ts` |
| Change detection behavior | `src/lib/nlp/*.ts` (NOT orchestrator) |
| Add an API endpoint | `src/app/api/v1/` (versioned surface) |
| Add business logic | `src/lib/services/*.service.ts` |
| Swap a backend | `src/lib/providers/implementations/` + `index.ts` + env var |
| Add a new document domain | `src/lib/intelligence/` engine + registry |
| Startup behavior | `src/instrumentation.ts` |
| Security checks | `src/lib/middleware/` + tests in `src/__tests__/security/` |
| DB schema | `prisma/schema.prisma` |

## Worker service layout

`mini-services/lemniscate-worker/` is a Bun workspace package with its own
`package.json` and `tsconfig.json`. Its `tsconfig` sets `@/* → ../../src/*`,
so the worker imports app code directly (shares `src/lib/` with the Next.js
app). Entry: `index.ts` (Socket.IO server + job poller).
