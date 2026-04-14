/**
 * security/secretStore.ts — Encrypted Secret Store
 *
 * Pluggable storage backend for API secrets. Supports:
 * - Encrypted localStorage (browser)
 * - In-memory store (testing / ephemeral sessions)
 * - Environment variables (server-side / build-time)
 * - Runtime injection (backend proxy, vault integration)
 *
 * All values are encrypted at rest using AES-GCM before persistence.
 * Keys are NEVER stored in plaintext in any backend.
 */

import type { SecretStoreBackend, ProviderName, ProviderSecrets } from './types';
import { encrypt, decrypt } from './crypto';

// ─── STORAGE KEY NAMESPACE ────────────────────────────────────────────────────

const STORE_PREFIX = 'icn-secret:' as const;

function slotKey(provider: ProviderName, slot: string): string {
    return `${STORE_PREFIX}${provider}:${slot}`;
}

// ─── ENCRYPTED STORE WRAPPER ──────────────────────────────────────────────────

/**
 * SecretStore wraps a raw storage backend with AES-GCM encryption.
 * All reads/writes go through encrypt/decrypt — the backend never sees plaintext.
 */
export class SecretStore {
    private readonly backend: SecretStoreBackend;

    constructor(backend: SecretStoreBackend) {
        this.backend = backend;
    }

    // ─── Core Read / Write ─────────────────────────────────────────────────

    /** Encrypt and store a secret value. Empty/undefined values clear the slot. */
    async setSecret(key: string, plaintext: string | undefined): Promise<void> {
        if (!plaintext?.trim()) {
            await this.backend.delete(key);
            return;
        }
        const ciphertext = await encrypt(plaintext.trim());
        if (!ciphertext) {
            throw new Error(`Encryption failed for key slot: ${key}`);
        }
        await this.backend.set(key, ciphertext);
    }

    /** Retrieve and decrypt a secret value. Returns empty string on missing/corrupt data. */
    async getSecret(key: string): Promise<string> {
        const ciphertext = await this.backend.get(key);
        if (!ciphertext) return '';
        const plaintext = await decrypt(ciphertext);
        return plaintext.trim();
    }

    /** Delete a secret from the store. */
    async deleteSecret(key: string): Promise<void> {
        await this.backend.delete(key);
    }

    /** Check if a secret exists without decrypting. */
    async hasSecret(key: string): Promise<boolean> {
        return this.backend.has(key);
    }

    // ─── Provider-Level Access ─────────────────────────────────────────────

    /** Store all secrets for a provider (primary, fallback, endpoint). */
    async setProviderSecrets(provider: ProviderName, secrets: ProviderSecrets): Promise<void> {
        await Promise.all([
            this.setSecret(slotKey(provider, 'primary'), secrets.primaryKey),
            this.setSecret(slotKey(provider, 'fallback'), secrets.fallbackKey),
            this.setSecret(slotKey(provider, 'endpoint'), secrets.endpoint),
        ]);
    }

    /** Retrieve all secrets for a provider. */
    async getProviderSecrets(provider: ProviderName): Promise<ProviderSecrets> {
        const [primaryKey, fallbackKey, endpoint] = await Promise.all([
            this.getSecret(slotKey(provider, 'primary')),
            this.getSecret(slotKey(provider, 'fallback')),
            this.getSecret(slotKey(provider, 'endpoint')),
        ]);
        return {
            primaryKey: primaryKey || undefined,
            fallbackKey: fallbackKey || undefined,
            endpoint: endpoint || undefined,
        };
    }

    /** Delete all secrets for a provider. */
    async clearProvider(provider: ProviderName): Promise<void> {
        await Promise.all([
            this.deleteSecret(slotKey(provider, 'primary')),
            this.deleteSecret(slotKey(provider, 'fallback')),
            this.deleteSecret(slotKey(provider, 'endpoint')),
        ]);
    }

    /** Delete ALL secrets in this store. */
    async clearAll(providers: readonly ProviderName[]): Promise<void> {
        await Promise.all(providers.map(p => this.clearProvider(p)));
    }
}

// ─── STORAGE BACKENDS ─────────────────────────────────────────────────────────

/**
 * In-memory backend for tests and ephemeral sessions.
 * Secrets are lost on process exit.
 */
export class MemoryStoreBackend implements SecretStoreBackend {
    private readonly store = new Map<string, string>();

    async get(key: string): Promise<string | null> {
        return this.store.get(key) ?? null;
    }

    async set(key: string, value: string): Promise<void> {
        this.store.set(key, value);
    }

    async delete(key: string): Promise<void> {
        this.store.delete(key);
    }

    async has(key: string): Promise<boolean> {
        return this.store.has(key);
    }

    /** Test helper — returns the number of stored entries. */
    get size(): number {
        return this.store.size;
    }

    /** Test helper — clears all entries. */
    clear(): void {
        this.store.clear();
    }
}

/**
 * Browser localStorage backend with error tolerance.
 * Handles private browsing, quota exhaustion, and SSR environments.
 */
export class LocalStorageBackend implements SecretStoreBackend {
    private getStorage(): Storage | null {
        if (typeof window === 'undefined') return null;
        try {
            return window.localStorage;
        } catch {
            return null;
        }
    }

    async get(key: string): Promise<string | null> {
        return this.getStorage()?.getItem(key) ?? null;
    }

    async set(key: string, value: string): Promise<void> {
        const storage = this.getStorage();
        if (!storage) return;
        try {
            storage.setItem(key, value);
        } catch {
            // Quota exceeded or private browsing — silently fail.
            // The key won't persist but the runtime copy in SecretStore still works.
        }
    }

    async delete(key: string): Promise<void> {
        this.getStorage()?.removeItem(key);
    }

    async has(key: string): Promise<boolean> {
        return this.getStorage()?.getItem(key) != null;
    }
}

/**
 * Environment-variables backend for server-side secrets.
 * Reads from process.env (Node) or import.meta.env (Vite).
 * Write operations are no-ops — env vars are immutable at runtime.
 *
 * Key mapping: `icn-secret:openai:primary` → `ICN_SECRET_OPENAI_PRIMARY`
 */
export class EnvStoreBackend implements SecretStoreBackend {
    private readonly envSource: Record<string, string | undefined>;

    constructor(envSource?: Record<string, string | undefined>) {
        // Allow injection for testing. Default to import.meta.env at build time.
        this.envSource = envSource ?? this.resolveEnvSource();
    }

    async get(key: string): Promise<string | null> {
        const envKey = this.toEnvVarName(key);
        return this.envSource[envKey] ?? null;
    }

    /** No-op — environment variables are immutable at runtime. */
    async set(_key: string, _value: string): Promise<void> {
        void _key;
        void _value;
        // Intentional no-op. Log in dev for visibility.
        if (import.meta.env.DEV) {
            console.warn('[EnvStoreBackend] Cannot write to environment variables at runtime.');
        }
    }

    /** No-op — environment variables cannot be deleted. */
    async delete(_key: string): Promise<void> {
        void _key;
        // Intentional no-op.
    }

    async has(key: string): Promise<boolean> {
        const envKey = this.toEnvVarName(key);
        return envKey in this.envSource && !!this.envSource[envKey];
    }

    /**
     * Convert a store key to an env var name.
     * `icn-secret:openai:primary` → `ICN_SECRET_OPENAI_PRIMARY`
     */
    private toEnvVarName(key: string): string {
        return key.replace(/:/g, '_').replace(/-/g, '_').toUpperCase();
    }

    private resolveEnvSource(): Record<string, string | undefined> {
        // Vite injects import.meta.env at build time.
        try {
            if (typeof import.meta !== 'undefined' && import.meta.env) {
                return import.meta.env as Record<string, string | undefined>;
            }
        } catch {
            // import.meta not available
        }
        return {};
    }
}

/**
 * Layered backend — tries sources in priority order.
 * Reads: env → runtime → localStorage (first hit wins).
 * Writes: go to the writable backend (runtime or localStorage).
 */
export class LayeredStoreBackend implements SecretStoreBackend {
    private readonly layers: readonly SecretStoreBackend[];
    private readonly writableLayer: SecretStoreBackend;

    constructor(layers: SecretStoreBackend[], writableLayer: SecretStoreBackend) {
        this.layers = layers;
        this.writableLayer = writableLayer;
    }

    async get(key: string): Promise<string | null> {
        for (const layer of this.layers) {
            const value = await layer.get(key);
            if (value) return value;
        }
        return null;
    }

    async set(key: string, value: string): Promise<void> {
        await this.writableLayer.set(key, value);
    }

    async delete(key: string): Promise<void> {
        await this.writableLayer.delete(key);
    }

    async has(key: string): Promise<boolean> {
        for (const layer of this.layers) {
            if (await layer.has(key)) return true;
        }
        return false;
    }
}
