# Appwrite Integration — Design Spec

> **Status:** Abstraction only. No Appwrite SDK is installed and no business
> logic depends on it. This document describes the **intended** integration path
> so a future implementation can land behind the existing provider seam without
> touching services or routes.

Lemniscate's hard constraint is **No AI / no outbound service calls in the
processing pipeline**. Appwrite is therefore considered **only** for
identity/storage/database concerns surrounding the pipeline — never inside it.

## 1. Why a provider seam, not a direct dependency

The codebase already routes every swappable capability through
`src/lib/providers/` (interface → registry → implementation). An `IAuthProvider`
slot has been added to `types.ts` and registered (with **no default
implementation**) in `registry.ts`, mirroring the existing `embedding`
unimplemented-seam pattern.

Selection is by env var, identical to every other provider:

```
AUTH_PROVIDER=appwrite   # future; unset today → single-shared-key auth
```

`getAuthProvider()` short-circuits to `null` when the env var is unset, so the
current single-shared-API-key behavior (`src/lib/middleware/security.ts`) stays
the default and nothing changes until an implementation is wired.

This means a future Appwrite implementation:

- lives entirely in `src/lib/providers/implementations/appwrite-auth.ts`,
- registers itself in `providers/index.ts`,
- is selected via `AUTH_PROVIDER=appwrite`,
- and **requires zero changes** to API routes or services.

## 2. Scope of integration

| Capability | In scope for Appwrite | Notes |
|---|---|---|
| Authentication | ✅ | Replaces single shared key with per-user sessions. |
| User management | ✅ | Appwrite Users API. |
| Storage (uploads) | ✅ optional | `IStorageProvider` already exists; an Appwrite bucket impl can replace `local`. |
| Database | ⚠️ deferred | SQLite + Prisma is canonical. Appwrite DB is a larger migration, out of scope here. |
| Functions | ❌ future | Would run pipeline stages serverlessly — conflicts with the embedded/standalone worker model today. |
| Messaging | ❌ future | No current use case. |

## 3. `IAuthProvider` contract (added)

```ts
export interface AuthUser {
  id: string
  email?: string
  name?: string
  roles: string[]            // e.g. ['reader', 'admin']
}

export interface AuthSession {
  user: AuthUser
  token: string              // opaque session token to echo back
  expiresAt: number          // epoch ms
}

export interface IAuthProvider {
  readonly name: string
  /** Validate a presented token/header and return the resolved user, or null. */
  authenticate(request: Request): Promise<AuthUser | null>
  /** Optional: create a session (login). No-op-able for token-based providers. */
  createSession?(credentials: Record<string, unknown>): Promise<AuthSession>
  /** Optional: revoke a session (logout). */
  revokeSession?(token: string): Promise<void>
}
```

The middleware in `security.ts` would call `getAuthProvider()`; when non-null it
delegates `authenticate()` instead of comparing against `LEMNISCATE_API_KEY`.
When null, today's behavior is unchanged.

## 4. Integration steps (when implemented)

1. `bun add node-appwrite` (runtime dep) — gated behind `AUTH_PROVIDER=appwrite`.
2. Implement `appwrite-auth.ts` under `implementations/`, reading
   `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY` from env.
3. Register in `providers/index.ts`:
   ```ts
   registerProvider('auth', 'appwrite', async () => {
     const { AppwriteAuthProvider } = await import('./implementations/appwrite-auth')
     return new AppwriteAuthProvider()
   })
   ```
4. Update `security.ts` to consult `getAuthProvider()` first, falling back to
   the shared API key when it resolves to null.
5. Add env validation in `env-validation.ts` for the Appwrite vars **only when
   `AUTH_PROVIDER=appwrite`** is set.
6. Add `APPWRITE_*` to `.env.example` (commented) and this doc.

## 5. Non-goals / guardrails

- **Never** route pipeline text through Appwrite. The deterministic NLP stages
  (`src/lib/pipeline/`, `src/lib/nlp/`) must remain offline and local.
- Appwrite is an **identity and (optionally) storage** backend, not a
  processing backend.
- The single-shared-key path must remain the zero-config default so self-hosted
  single-user deployments keep working without an Appwrite project.
