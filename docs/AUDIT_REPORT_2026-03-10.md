# InfinityCN Comprehensive Audit Report

Date: 2026-03-10  
Scope: Frontend (`/src`), backend (`/server/src`), build/devops config, dependency and test/build health.

## Executive Summary

Overall, the repository is in **good engineering health** with strong TypeScript coverage, passing tests, passing lint/format checks, and successful production builds for both frontend and backend.

Primary risks found are **operational/security hardening gaps** rather than immediate correctness defects:

1. **No authN/authZ on job APIs** (status, chapter fetch, cancel, SSE), enabling ID-based access to queued/processed content.
2. **Rate limiting applies only to `/api/ai`**, not `/api/jobs` endpoints (potential queue abuse/DoS).
3. **No CSP/security headers configured by default** for frontend delivery path.
4. **Default RabbitMQ credentials** present in defaults/docs (acceptable for local dev, risky if reused in production).
5. **Known build-time warning for `eval` in third-party `onnxruntime-web` bundle** (supply-chain/runtime policy concern).

---

## What Was Audited

- Code quality and static checks
- Test suite status
- Build and type-check status
- Security posture (input validation, rate limiting, CORS, secret handling, SSRF controls, auth surface)
- Dependency audit capability in this environment
- Runtime/deployment config baselines

---

## Validation Commands & Results

### Frontend
- `npm run lint` ✅ pass
- `npm test` ✅ pass (211 tests)
- `npm run build` ✅ pass (PWA artifacts generated)
- `npm run format:check` ✅ pass

### Backend
- `cd server && npm run typecheck` ✅ pass
- `cd server && npm run build` ✅ pass

### Dependency Security Audit
- `npm audit --omit=dev --json` ⚠️ blocked by registry `403 Forbidden` in this environment
- `cd server && npm audit --omit=dev --json` ⚠️ blocked by registry `403 Forbidden` in this environment

---

## Detailed Findings

## 1) Missing AuthN/AuthZ on Job APIs (**High**)

**Affected endpoints**
- `POST /api/jobs`
- `GET /api/jobs/:bookId`
- `GET /api/jobs/:bookId/chapters/:index`
- `DELETE /api/jobs/:bookId`
- `GET /api/jobs/:bookId/events`

**Risk**
Any client that can guess or obtain `bookId` can read status/results or cancel jobs. This is a confidentiality and integrity risk for shared deployments.

**Evidence**
Route handlers enforce payload/shape/ID validation but no authentication or ownership checks.

**Recommendation**
- Introduce auth middleware (API key/JWT/session) and attach principal to request.
- Store `ownerId` on job creation and enforce owner checks on read/cancel/event routes.
- Consider opaque high-entropy IDs (UUIDv4) instead of timestamp-based `book-${Date.now()}` when server generates IDs.

---

## 2) Rate Limiting Coverage Gap on Job Endpoints (**High**)

**Risk**
Only `/api/ai` has rate limiting; job creation and polling/SSE endpoints can be spammed to create queue pressure and Redis load.

**Recommendation**
- Add dedicated rate limiting for `/api/jobs` routes (different budgets for submit vs read).
- Add payload-based guardrails (e.g., max jobs per identity/day).
- Add circuit breakers when RabbitMQ/Redis are degraded.

---

## 3) Security Headers / CSP Not Enforced by Default (**Medium**)

**Risk**
Frontend `index.html` does not define CSP and server middleware does not add security headers. XSS impact is amplified because encrypted keys still reside in browser storage and can be exfiltrated by active script.

**Recommendation**
- Enforce CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and HSTS (at reverse proxy / CDN / server).
- Minimize inline script/style usage to support strict CSP.

---

## 4) Development Defaults Could Leak into Production (**Medium**)

**Risk**
Default RabbitMQ credentials (`infinitycn` / `infinitycn_dev`) are present in config and docs. If carried into production, this weakens infrastructure access control.

**Recommendation**
- Fail fast in production if default credentials are detected.
- Document explicit production hardening checklist and enforce secrets from env manager.

---

## 5) Third-Party Bundle Warning: `eval` in `onnxruntime-web` (**Medium**)

**Risk**
Build emits a warning about `eval` usage in dependency bundle. This may conflict with strict CSP and can be a policy/supply-chain review blocker.

**Recommendation**
- Track upstream issue/version notes for `onnxruntime-web`.
- Evaluate alternate runtime configuration/build target that avoids `eval`.
- If unavoidable, scope CSP exceptions narrowly and document rationale.

---

## 6) Positive Security Controls Already Present

- Request body size limit on API server (`1mb`).
- Strong input validation in job submission (chapter count/size/title/provider/bookId bounds).
- SSRF-minded validation for `OLLAMA_URL` (blocks internal/local metadata patterns).
- Provider timeout controls via `AbortSignal.timeout(60_000)`.
- Token capping (`maxTokensCap`) to reduce cost abuse.
- Redis-backed sliding-window limiter for `/api/ai`.
- CORS allowlist support via `ALLOWED_ORIGINS`.
- Encrypted client API-key storage (AES-GCM/PBKDF2) with migration from legacy obfuscation.

---

## Reliability/Performance Notes

- Test suite breadth is strong for frontend state/lib layers and component entry flow.
- Build output indicates very large ML/PDF-related chunks (expected in this domain, but worth continuous budget monitoring).
- Graceful degradation for Redis/RabbitMQ connection failures is implemented, reducing hard outages.

---

## Prioritized Remediation Plan

### Immediate (1-3 days)
1. Add authentication and ownership checks to all job endpoints.
2. Add rate limiting on `/api/jobs` (submit, status, chapter, events, cancel).
3. Use UUIDs for server-generated `bookId`.

### Near term (1-2 weeks)
4. Enforce security headers + CSP in production ingress path.
5. Add startup guardrails for unsafe default credentials in `NODE_ENV=production`.
6. Add server test coverage for auth/authorization and rate-limit behaviors.

### Medium term (2-4 weeks)
7. Address/mitigate `onnxruntime-web` eval warning for stricter CSP compatibility.
8. Add abuse monitoring dashboards: jobs submitted, queue depth, per-IP/provider error rates, 429 rate.

---

## Final Assessment

- **Code quality:** Strong
- **Test/build health:** Strong
- **Security baseline:** Moderate with clear hardening opportunities
- **Production readiness:** Good for controlled environments; requires auth/rate-limit/header hardening for multi-tenant/public exposure

