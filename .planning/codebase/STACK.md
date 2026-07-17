---
focus: tech
last_mapped: 2026-07-17
---

# Tech Stack

## Languages & Runtime

| Layer | Choice |
|---|---|
| Language | TypeScript 5 (strict, `noEmit`) |
| Runtime | Node.js (production: Bun runs `.next/standalone/server.js`) |
| Package manager | **Bun** primary (`bun.lock`); npm compatible (`package-lock.json` removed on `v0`) |
| Workspaces | `mini-services/lemniscate-worker` is a workspace package |

## Framework & UI

| Concern | Library |
|---|---|
| Web framework | Next.js 16 (App Router, `output: "standalone"`, `reactStrictMode`) |
| React | 19 |
| Styling | Tailwind CSS 4 (`@tailwindcss/postcss`) + `tw-animate-css` |
| Component kit | shadcn/ui over Radix primitives (`src/components/ui/`) |
| Icons | `lucide-react` (tree-shaken via `experimental.optimizePackageImports`) |
| Animation | `framer-motion` (`src/lib/motion.ts`) |
| Theming | `next-themes` (`src/components/lemniscate/theme-provider.tsx`) |
| Client state | Zustand (`src/components/lemniscate/store.ts`) |
| Validation | Zod 4 |

## Data & Persistence

| Concern | Library / path |
|---|---|
| ORM | Prisma 6 (`@prisma/client` + `prisma` CLI) |
| Primary DB | SQLite (file-based) — `src/lib/db.ts`, WAL mode |
| libSQL adapter | `@libsql/client` + `@prisma/adapter-libsql` (Vercel/Turso path) |
| Queue | SQLite `Job` table + atomic CAS claim (no external broker) |
| Backups | `src/lib/backup.ts` — scheduled file copy of the DB |

## Realtime

| Concern | Library |
|---|---|
| WebSocket server | `socket.io` (worker, port 3003) |
| WebSocket client | `socket.io-client` (`src/components/lemniscate/use-realtime.ts`) |
| Rate limiting | `ioredis` (Redis 7-alpine in compose) with in-memory fallback |

## Document Parsing (the only format-aware code)

| Format | Library |
|---|---|
| PDF | `pdf-parse` (run in isolated child process `pdf-extract-worker.mjs` for crash-safety) |
| DOCX | `mammoth` (`serverExternalPackages` in `next.config.ts`) |
| TXT | native read |

> **No ML/AI/LLM dependencies anywhere.** NLP is 100% handcrafted rules + lexicons in `src/lib/nlp/`.

## Key Configuration Files

| File | Purpose |
|---|---|
| `next.config.ts` | `output: standalone`, NFT + Turbopack root pins, `serverExternalPackages: ["mammoth"]`, `optimizePackageImports` |
| `tsconfig.json` | path alias `@/*` → `./src/*`, `noEmit` |
| `vitest.config.ts` | node env, 10s timeout, coverage (v8) thresholds lines/funcs/stmts ≥60, branches ≥50 |
| `eslint.config.mjs` | Next core-web-vitals + TS presets; most TS/React issues as `warn` |
| `prisma/schema.prisma` | 13 models (Document, Job, RawText, Narrative, Paragraph, Scene, Character, Location, Event, NarrativeArc, EmotionalPeak, ProcessingLog, ReadingProgress, Bookmark) |
| `docker-compose.yml` | app / worker / redis / caddy |
| `Caddyfile` | reverse proxy on :81, routes `?XTransformPort=3003` WS to worker |
| `vercel.json` | Vercel build (`prisma generate && next build`) + per-route `maxDuration` |

## Scripts (`package.json`)

| Script | Command |
|---|---|
| `dev` | `bun run next dev -p 3000` |
| `build` | `next build --webpack` + inline Node `cpSync` for standalone (Windows-safe) |
| `build:unix` | `next build` + shell `cp` of static/public |
| `start` | `NODE_ENV=production bun .next/standalone/server.js` |
| `build:vercel` | `prisma generate && next build` |
| `lint` | `eslint .` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `db:push` | `prisma db push` (primary schema workflow — **no migration history**) |
| `db:generate` / `db:migrate` / `db:reset` / `postinstall` | standard Prisma |

## Environment Variables (validated in `src/lib/env-validation.ts`)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | always | must start with `file:` |
| `LEMNISCATE_API_KEY` | production | ≥16 chars, checked at startup |
| `LEMNISCATE_ALLOWED_ORIGINS` | production | CSV for CORS/CSRF |
| `DISABLE_EMBEDDED_WORKER` | optional | `1` in Docker app container |
| `REDIS_URL` | optional | rate-limit counters only |
| `WORKER_CONCURRENCY` / `WORKER_POLL_INTERVAL_MS` | optional | worker tuning |
| `BACKUP_DIR` / `BACKUP_INTERVAL_HOURS` / `BACKUP_RETENTION_COUNT` | optional | SQLite backup scheduler |
| `LEMNISCATE_TRUSTED_PROXY_CIDR` | optional | client-IP extraction behind Caddy |
