# Security Policy

## Reporting a Vulnerability

Lemniscate is a deterministic, offline document-processing platform. If you
discover a security vulnerability, please report it responsibly:

- **Email:** open a private GitHub Security Advisory
  (Repo → Security → Advisories → "Report a vulnerability"), or
- **Do not** open a public issue for security-sensitive reports.

We will acknowledge receipt within 72 hours and aim to ship a fix for
confirmed high-severity issues within 14 days. Please do not disclose the
issue publicly until a fix is released.

## Supported Versions

Only the latest release line receives security fixes.

## Threat Model

Lemniscate is designed for **single-user / small-team** deployments behind a
reverse proxy (Caddy in the bundled Docker Compose stack). It is **not** a
multi-tenant SaaS. Authentication is a single shared API key; there is no
per-user identity, session, or RBAC today (the `authorize()` extension point
exists but is a no-op by design).

The application processes **untrusted uploaded documents** (PDF/DOCX/TXT) and
runs deterministic, offline NLP over their extracted text. There are **no
LLMs, AI APIs, or outbound network calls** in the processing pipeline — this
is a hard product constraint, not a configuration.

## Authentication & Authorization

- **API key** (`LEMNISCATE_API_KEY`, ≥16 chars): required in production. The
  app refuses to start in `NODE_ENV=production` without it
  (`src/lib/env-validation.ts`, `src/lib/middleware/security.ts`). Validated
  against the `Authorization: Bearer <key>` and `x-api-key` headers using
  constant-time comparison (inputs are SHA-256 hashed to a fixed length before
  `timingSafeEqual`, so timing does not leak key length).
- **First-party browser requests**: the app's own UI cannot hold the server
  secret, so same-site browser requests are accepted via `Origin`/`Referer`
  allowlist matching or the browser-set `Sec-Fetch-Site: same-origin` header.
- **CSRF**: state-changing methods (POST/PUT/DELETE) require an
  `Origin`/`Referer` that matches `LEMNISCATE_ALLOWED_ORIGINS`
  (`checkCSRF` in `src/lib/middleware/security.ts`).

## Rate Limiting

A fixed-window limiter (`src/lib/middleware/rate-limit.ts`) keys on client IP
per endpoint. When `REDIS_URL` is set, counters live in Redis via an atomic
Lua script (shared across instances, survives restarts); otherwise an
in-memory Map is used (per-process, lost on restart). The limiter fails open
to memory if Redis is unreachable.

`getClientIP` trusts `X-Forwarded-For` / `X-Real-IP` **only** when the
connection originates from a configured trusted proxy
(`LEMNISCATE_TRUSTED_PROXY_CIDR`, default: localhost only). Set this to your
reverse proxy's subnet (e.g. `172.16.0.0/12` for Docker) so per-IP limits work
behind the proxy.

## Upload Safety

Uploads are validated in three layers (`src/lib/middleware/body-size.ts`,
upload route, and the parser):

1. **Size**: enforced via `Content-Length` and `MAX_UPLOAD_BYTES` (default
   25 MB; Caddy also caps at 30 MB).
2. **MIME + extension**: the declared MIME type must match the file extension.
3. **Magic bytes**: the file's leading bytes are sniffed to confirm it is
   genuinely a PDF/DOCX/TXT, regardless of the claimed MIME/extension.

PDF parsing runs in an isolated child process
(`src/lib/pipeline/pdf-extract-worker.mjs`) with a timeout, so a malformed or
malicious PDF cannot crash the main Node.js process.

## Path Traversal

Storage keys and path IDs are validated:

- `validateIdParam` / `isValidId` (`src/lib/middleware/validate-id.ts`)
  accepts only CUID, CUID2, or UUID formats and rejects any `/`, `\`, `.`, or
  whitespace.
- `uploadPath` (`src/lib/storage/index.ts`) resolves storage names against the
  upload root and rejects traversals.

## Security Headers

- **Next.js** (`next.config.ts`): `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy`, HSTS, `Permissions-Policy`,
  `Cross-Origin-Opener-Policy: same-origin`. API responses are sent
  `Cache-Control: no-store`.
- **Caddy** (`Caddyfile`): mirrors the above and strips the `Server` header.
- **CSP** (`src/proxy.ts`): a per-request nonce-based Content-Security-Policy
  is applied to document (HTML) routes. The production `connect-src` is
  `'self' wss:`; if you deploy the realtime worker on a different origin,
  tighten this to the specific worker host.

## Secrets & Environment

- `.env*` files are gitignored (only `.env*.example` templates are tracked).
- Production-required variables (`DATABASE_URL`, `LEMNISCATE_API_KEY`,
  `LEMNISCATE_ALLOWED_ORIGINS`) are validated at startup
  (`src/lib/env-validation.ts`); the app fails fast in production if any are
  missing/invalid.
- The Docker Compose stack requires `LEMNISCATE_API_KEY` to be set in `.env`
  before `docker compose up` (enforced via `${VAR:?...}` substitution).

## Database

SQLite (WAL mode) on a named Docker volume. Automated backups run in-process
(`src/lib/backup.ts`) every `BACKUP_INTERVAL_HOURS` (default 24h), retaining
`BACKUP_RETENTION_COUNT` (default 7) copies in `BACKUP_DIR`. Backups are
gitignored.

## What Is NOT Implemented (Reserved Seams)

These are documented extension points, **not** working features — do not
assume they are active:

- **Embedding provider slot** (`EMBEDDING_PROVIDER`): no registered
  implementation, no caller. Intentional extension point.
- **Redis-backed queue coordination / horizontal Socket.IO scaling**
  (`REDIS_URL`): Redis is used **only** for rate-limit counters today. The job
  queue is the SQLite `Job` table with atomic CAS claiming regardless of
  `REDIS_URL`.

## Security Tests

Security regressions are guarded by `src/__tests__/security/` (auth, CSRF,
CSP, ID validation, rate limiting, socket validation, trusted proxy, upload
validation). Keep these green when touching middleware or upload handling:

```bash
bunx vitest run src/__tests__/security/
```
