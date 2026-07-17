---
focus: concerns
mapped_at: 2026-07-17
last_mapped_commit: v0
---

# Concerns, Tech Debt & Risk Areas

## Active redesign (mid-rebuild)

The reader and pipeline are **mid-rebuild**. Per `CLAUDE.md`:

- Newer surfaces: `src/lib/intelligence/` engine layer (engine → registry →
  `NovelIntelligenceEngine`) and `src/lib/pipeline/metadata.ts`.
- `cinematified-v2.test.ts` is their integration harness.
- **Treat these as active development, not final.**
- Before assuming any one path is canonical, **check `git status` / recent
  commits** — two parallel code paths (v1 cinematified vs v2 intelligence)
  currently coexist.

**Branch note:** the redesign lives on the `v0` branch, which is ~522 files
diverged from `main` (124k deletions). `main` holds the older tree. Confirm
which branch you're on before reasoning about "current" architecture.

## Authoritative-vs-aspirational doc drift

- `README.md` is the source of truth for architecture and methodology.
- `AGENTS.md` and `docs/ARCHITECTURE.md` were **removed** in earlier
  revisions — don't reference them.
- `.kiro/steering/*.md` is **aspirational design guidance, not ground
  truth**. `devops.md` in particular describes a Postgres/Redis/Nginx
  topology that is **not** what's implemented (real stack: SQLite +
  SQLite-queue + Caddy).

## Unimplemented / reserved seams (don't wire up without explicit task)

1. **Redis-backed queue coordination / `lemniscate:events` pub-sub** for
   multiple Socket.IO gateways — reserved, unimplemented. `REDIS_URL` today
   backs **only rate limiting** (`src/lib/middleware/rate-limit.ts`). The
   SQLite CAS queue is the queue regardless of `REDIS_URL`.
2. **`embedding` provider** — opt-in, **no default implementation yet**.
3. **`auth` provider** — unimplemented extension point. The app ships
   **single-shared-key auth** (`LEMNISCATE_API_KEY`), not per-user identity.
   Vercel/README call this out explicitly.
4. **DB migration history** — project uses `db push`; there is **no
   migration history**. Schema changes must be deliberate (add indexes /
   constraints / FKs manually).

## Horizontal scaling ceiling

- Single-node by design. The queue **is** the SQLite `Job` table — no
  external broker. Scaling beyond a single node requires moving off SQLite
  (Postgres, or Turso via the bundled `@libsql/client` +
  `@prisma/adapter-libsql`).
- The Vercel deploy path uses Turso (libSQL) for this reason.

## PDF extraction crash-safety

`pdf-parse` is isolated in a **child process** (`pdf-extract-worker.mjs`)
because malformed PDFs can crash the parser. Any change to PDF handling
must preserve this process boundary — a crash in the child must not take
down the worker/pipeline.

## SQLite path-resolution gotcha

Relative `file:` URLs in `DATABASE_URL` resolve **relative to
`prisma/schema.prisma`**, not the project root. So `file:./db/custom.db`
(the dev default in `.env`) reads/writes `prisma/db/custom.db`. Docker uses
an absolute `file:/app/db/custom.db` on a named volume to avoid ambiguity.
WAL mode is enabled.

## Security surface (enforced centrally — keep green)

- `src/lib/middleware/`: `security.ts` (API-key + CSRF origin), `rate-limit.ts`,
  `validate-id.ts`, `body-size.ts`.
- Upload validation: MIME + extension + **magic bytes**.
- Production requires `LEMNISCATE_API_KEY` (≥16 chars), checked at startup
  (`src/lib/env-validation.ts` — fail-fast in prod, warn in dev).
- Trust-proxy CIDR for client-IP extraction behind Caddy
  (`LEMNISCATE_TRUSTED_PROXY_CIDR`, default `172.16.0.0/12`).
- Security tests in `src/__tests__/security/` must stay green.
- Recent commit history shows heavy CodeQL/APIsec finding churn — expect
  security hardening to be an active theme.

## Build quirks

- Default `build` script runs `next build --webpack` (not the Next 16
  Turbopack default) and an inline Node `cpSync` to copy `static` + `public`
  into `standalone` (Windows-safe). `build:unix` is the shell-`cp` variant.
- `next.config.ts` pins `outputFileTracingRoot` and `turbopack.root` to the
  project dir to prevent stray parent-directory lockfiles from inflating the
  NFT trace ("whole project traced" warning).
- `serverExternalPackages: ["mammoth"]` — mammoth must not be bundled.

## Automated SQLite backups

On every server boot, `src/instrumentation.ts` calls `startBackupScheduler()`
(`src/lib/backup.ts`), copying the resolved `DATABASE_URL` file to
`BACKUP_DIR` (default `./backups`) every `BACKUP_INTERVAL_HOURS` (24h),
keeping `BACKUP_RETENTION_COUNT` (7). Runs in the app process —
Docker/worker-only setups inherit it via the `app` container. Idempotent.
