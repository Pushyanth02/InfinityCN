# External Integrations

> Lemniscate is privacy-first and offline-by-design. There are **no outbound AI / SaaS calls** during document processing. Integrations are limited to infrastructure backends and local toolchains.

Last updated: 2026-07-17

---

## Databases

### SQLite (primary, always-on)

- **Driver**: Prisma ORM (`@prisma/client` ^6.11) — `src/lib/db.ts`
- **Provider**: `sqlite` (configured in `prisma/schema.prisma`)
- **WAL mode** enabled for concurrent reader/writer performance
- **Path resolution**: relative `file:` URLs resolve relative to `prisma/schema.prisma`, not the project root. Dev default `file:./db/custom.db` → `prisma/db/custom.db`. Docker uses absolute `file:/app/db/custom.db`.
- **Role**: source-of-truth store AND job queue (the `Job` table is the queue — no Redis broker)

### libSQL / Turso (Vercel / serverless path)

- **Drivers**: `@libsql/client` ^0.17, `@prisma/adapter-libsql` ^6.11
- **Used only on the Vercel deployment** (SQLite file storage isn't available serverless). Configured via `.env.vercel.example` / `vercel.json`.
- **Not** used in the local/Docker stack.

### Redis (optional, rate-limiting only)

- **Client**: `ioredis` ^5.11 — `src/lib/middleware/rate-limit.ts`
- **Purpose**: atomic Lua fixed-window counter for rate limiting; shared across instances, survives restarts
- **In-memory fallback** when `REDIS_URL` is unset or Redis unreachable
- **⚠ Reserved, unimplemented seam**: Redis-backed queue coordination and `lemniscate:events` pub-sub for multi-gateway Socket.IO fan-out. **Do not wire this up** without an explicit task — the SQLite CAS queue is the queue regardless of `REDIS_URL`.
- Docker service: `redis:7-alpine`, AOF persistence, 256mb cap with allkeys-LRU

---

## Document parsing libraries (in-process, no network)

| Format | Library | Isolation |
|---|---|---|
| PDF | `pdf-parse` ^2.4 | Child process `src/lib/pipeline/pdf-extract-worker.mjs` (crash-isolation) |
| DOCX | `mammoth` ^1.12 | In-process; `serverExternalPackages: ["mammoth"]` in `next.config.ts` |
| TXT | native `fs` read | In-process |

Parsers are the **only** code allowed to know the source format — downstream stages consume the format-agnostic `CanonicalDocument`.

---

## Realtime transport

- **Socket.IO** ^4.8 — worker service on port 3003 (`mini-services/lemniscate-worker/index.ts`)
- Browser connects via `/?XTransformPort=3003`; Caddy routes WS by that query param
- In-process `EventBus` (`src/lib/events/bus.ts`) fans `ProgressEvent`s to subscribed clients; 200-event ring buffer per job replays history to late joiners

---

## Infrastructure / deployment surfaces

- **Caddy 2** reverse proxy (port 81) — `Caddyfile`; routes HTTP to app and WS to worker by `XTransformPort` query param
- **Docker Compose** — 4 services: `app`, `worker`, `redis`, `caddy` (`docker-compose.yml`)
- **GitHub Actions** — CI (`docker.yml`), CodeQL security scanning, APIsec scanning, pinned action SHAs (`.github/workflows/`)
- **Vercel** — serverless build target; `vercel.json` wires `build:vercel` + per-route `maxDuration`

---

## Authentication

- **Single shared API key** (`LEMNISCATE_API_KEY`, ≥16 chars, required in production) — `src/lib/middleware/security.ts`
- Per-user identity is an **unimplemented `auth` provider seam** (`getAuthProvider` exists, no default implementation) — reserved extension point, not wired.

---

## Outbound network calls

**None during processing.** The hard architectural constraint is zero outbound AI/ML calls and no telemetry. The only egress paths in the codebase are:

- Prisma ↔ SQLite file I/O (local)
- ioredis ↔ Redis (optional, rate-limit only)
- Socket.IO server ↔ browser (local network)

No fetch/HTTP to external APIs exists in the pipeline or NLP layers.

---

## Storage

- **Local file storage** — `src/lib/storage/index.ts`, surfaced via the `storage` provider (`LocalStorageProvider`, `src/lib/providers/implementations/local-storage.ts`)
- Upload volume: `uploads/` (or `UPLOAD_DIR`)
- No S3 / blob / cloud-storage provider implemented today.
