/**
 * security/types.ts — Security Layer Type Definitions
 *
 * Strict types for the multi-provider key management system.
 * All types are backend-oriented — no UI concerns leak in.
 */

// ─── PROVIDER NAME ────────────────────────────────────────────────────────────

export type ProviderName =
    | 'openai'
    | 'gemini'
    | 'claude'
    | 'ollama'
    | 'nim'
    | 'gemma'
    | 'gwen'
    | 'groq'
    | 'deepseek';

// ─── PROVIDER SECRETS ─────────────────────────────────────────────────────────

export interface ProviderSecrets {
    /** Primary API key for this provider. */
    primaryKey?: string;
    /** Fallback key used when primaryKey fails auth (401/403). */
    fallbackKey?: string;
    /** Custom endpoint URL (for self-hosted / proxy providers). */
    endpoint?: string;
}

// ─── SECRET STORE BACKEND ─────────────────────────────────────────────────────

/** Abstract storage backend for encrypted secrets. */
export interface SecretStoreBackend {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    has(key: string): Promise<boolean>;
}

// ─── KEY VALIDATION ───────────────────────────────────────────────────────────

export interface KeyValidationResult {
    valid: boolean;
    provider: ProviderName;
    /** Human-readable reason when validation fails. */
    reason?: string;
    /** Whether the key format matches the provider's expected pattern. */
    formatMatch: boolean;
    /** Whether the key passed a live health check (only if requested). */
    liveCheck?: boolean;
}

// ─── KEY ROTATION ─────────────────────────────────────────────────────────────

export interface KeyRotationEntry {
    provider: ProviderName;
    slot: 'primary' | 'fallback';
    /** ISO timestamp of when the key was last set. */
    setAt: string;
    /** ISO timestamp of when the key last succeeded. */
    lastSuccessAt?: string;
    /** ISO timestamp of when the key last failed. */
    lastFailureAt?: string;
    /** Number of consecutive failures. */
    consecutiveFailures: number;
}

// ─── KEY MANAGER CONFIG ───────────────────────────────────────────────────────

export interface KeyManagerConfig {
    /** If true, keys for remote providers MUST go through a backend proxy in production. */
    enforceBackendProxy: boolean;
    /** Maximum consecutive failures before a key is marked dead. */
    maxConsecutiveFailures: number;
    /** Providers that require HTTPS endpoints (all remote providers). */
    remoteProviders: ReadonlySet<ProviderName>;
    /** Providers that are local-only and don't need API keys. */
    localProviders: ReadonlySet<ProviderName>;
}
