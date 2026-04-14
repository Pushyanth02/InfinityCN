/**
 * security/keyManager.ts — Secure Multi-Provider Key Manager
 *
 * Backend-focused key management for the multi-provider AI system.
 *
 * Security guarantees:
 * - Keys NEVER exposed to frontend in production (backend proxy enforced)
 * - All keys encrypted at rest via AES-GCM
 * - Per-provider key validation with format-aware pattern matching
 * - Fallback key rotation with failure tracking
 * - Environment variable and runtime secret injection support
 * - No plaintext secret handling in production code paths
 */

import type {
    ProviderName,
    ProviderSecrets,
    KeyValidationResult,
    KeyRotationEntry,
    KeyManagerConfig,
    SecretStoreBackend,
} from './types';
import {
    SecretStore,
    MemoryStoreBackend,
    LocalStorageBackend,
    EnvStoreBackend,
    LayeredStoreBackend,
} from './secretStore';
import { encrypt, decrypt } from './crypto';
import { assertSecureEndpoint } from './aiSecurity';

// ─── RE-EXPORTS (backward compatibility) ──────────────────────────────────────

/**
 * Encrypt a raw API key. Trims whitespace and validates before encrypting.
 * Returns empty string for invalid keys.
 */
export async function encryptKey(rawKey: string): Promise<string> {
    const key = rawKey.trim();
    if (!validateKey(key)) return '';
    return encrypt(key);
}

/**
 * Decrypt an encrypted API key. Returns trimmed plaintext or empty string.
 */
export async function decryptKey(encryptedKey: string): Promise<string> {
    if (!encryptedKey) return '';
    const plain = await decrypt(encryptedKey);
    return plain.trim();
}

// ─── PROVIDER CLASSIFICATION ──────────────────────────────────────────────────

const REMOTE_PROVIDERS: ReadonlySet<ProviderName> = new Set([
    'openai',
    'gemini',
    'claude',
    'nim',
    'groq',
    'deepseek',
    'gwen',
]);

const LOCAL_PROVIDERS: ReadonlySet<ProviderName> = new Set(['ollama', 'gemma']);

// ─── KEY FORMAT PATTERNS ──────────────────────────────────────────────────────

/**
 * Provider-specific key format validators.
 * Each pattern checks the key's prefix and rough structure.
 * These are NOT security validators — they catch user typos and mis-pastes.
 */
const KEY_FORMAT_PATTERNS: Record<ProviderName, RegExp> = {
    openai: /^sk-[a-zA-Z0-9_-]{20,}$/,
    gemini: /^AIza[a-zA-Z0-9_-]{30,}$/,
    claude: /^sk-ant-[a-zA-Z0-9_-]{20,}$/,
    groq: /^gsk_[a-zA-Z0-9]{20,}$/,
    deepseek: /^[a-zA-Z0-9_-]{20,}$/,
    nim: /^nvapi-[a-zA-Z0-9_-]{20,}$/,
    gwen: /^[a-zA-Z0-9_.-]{6,}$/,
    ollama: /^.{0,}$/, // Ollama doesn't need a key
    gemma: /^.{0,}$/, // Gemma (via Ollama) doesn't need a key
};

/** Minimum key lengths per provider (0 = no key required). */
const MIN_KEY_LENGTH: Record<ProviderName, number> = {
    openai: 20,
    gemini: 30,
    claude: 20,
    groq: 20,
    deepseek: 20,
    nim: 20,
    gwen: 6,
    ollama: 0,
    gemma: 0,
};

// ─── DEFAULT CONFIG ───────────────────────────────────────────────────────────

const DEFAULT_CONFIG: KeyManagerConfig = {
    enforceBackendProxy: true,
    maxConsecutiveFailures: 5,
    remoteProviders: REMOTE_PROVIDERS,
    localProviders: LOCAL_PROVIDERS,
};

// ─── KEY MANAGER ──────────────────────────────────────────────────────────────

/**
 * Secure key manager for multi-provider AI system.
 *
 * Responsibilities:
 * 1. Store/retrieve encrypted provider keys
 * 2. Validate key format per-provider
 * 3. Track key rotation and failure state
 * 4. Enforce backend-only access for remote providers
 * 5. Resolve keys from env vars, runtime secrets, and encrypted storage
 */
export class KeyManager {
    private readonly store: SecretStore;
    private readonly config: KeyManagerConfig;
    private readonly rotationState: Map<string, KeyRotationEntry>;

    constructor(config?: Partial<KeyManagerConfig>, backend?: SecretStoreBackend) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.rotationState = new Map();

        // Default: layered backend (env → memory → localStorage)
        if (backend) {
            this.store = new SecretStore(backend);
        } else {
            const memoryLayer = new MemoryStoreBackend();
            const envLayer = new EnvStoreBackend();
            const localLayer = new LocalStorageBackend();

            const layered = new LayeredStoreBackend(
                [envLayer, memoryLayer, localLayer],
                memoryLayer,
            );
            this.store = new SecretStore(layered);
        }
    }

    // ─── Key Storage ──────────────────────────────────────────────────────

    /** Store provider secrets (encrypted at rest). */
    async setProviderSecrets(provider: ProviderName, secrets: ProviderSecrets): Promise<void> {
        await this.store.setProviderSecrets(provider, secrets);
        this.initRotationEntry(provider, 'primary');
        if (secrets.fallbackKey) {
            this.initRotationEntry(provider, 'fallback');
        }
    }

    /** Retrieve decrypted provider secrets. */
    async getProviderSecrets(provider: ProviderName): Promise<ProviderSecrets> {
        return this.store.getProviderSecrets(provider);
    }

    /** Clear all secrets for a provider. */
    async clearProvider(provider: ProviderName): Promise<void> {
        await this.store.clearProvider(provider);
        this.rotationState.delete(this.rotationKey(provider, 'primary'));
        this.rotationState.delete(this.rotationKey(provider, 'fallback'));
    }

    // ─── Key Resolution ───────────────────────────────────────────────────

    /**
     * Resolve the best available key for a provider.
     *
     * Priority:
     * 1. Primary key (if not failed out)
     * 2. Fallback key (if primary is exhausted)
     *
     * Throws if no key is available and provider requires one.
     */
    async getProviderKey(provider: ProviderName): Promise<string> {
        this.assertBackendOnly(provider);

        if (this.config.localProviders.has(provider)) {
            return ''; // Local providers don't need keys
        }

        const secrets = await this.store.getProviderSecrets(provider);

        // Try primary first unless it's failed out
        const primaryRotation = this.getRotation(provider, 'primary');
        const primaryExhausted =
            primaryRotation.consecutiveFailures >= this.config.maxConsecutiveFailures;

        if (!primaryExhausted && secrets.primaryKey) {
            return secrets.primaryKey;
        }

        // Fall back
        if (secrets.fallbackKey) {
            return secrets.fallbackKey;
        }

        // Primary is only failed, not missing? Still return it as last resort
        if (secrets.primaryKey) {
            return secrets.primaryKey;
        }

        throw new Error(
            `No API key configured for provider "${provider}". ` +
                `Set one via KeyManager.setProviderSecrets() or environment variables.`,
        );
    }

    /**
     * Get an ordered list of all candidate keys for rotation.
     * Used by the provider layer to try keys in sequence.
     */
    async getKeyCandidates(provider: ProviderName): Promise<string[]> {
        if (this.config.localProviders.has(provider)) return [];

        const secrets = await this.store.getProviderSecrets(provider);
        const candidates: string[] = [];

        if (secrets.primaryKey) candidates.push(secrets.primaryKey);
        if (secrets.fallbackKey && secrets.fallbackKey !== secrets.primaryKey) {
            candidates.push(secrets.fallbackKey);
        }

        return candidates;
    }

    // ─── Key Validation ───────────────────────────────────────────────────

    /**
     * Validate a provider key.
     *
     * Checks:
     * 1. Not empty (unless provider is local)
     * 2. Length within acceptable range
     * 3. No whitespace or control chars
     * 4. Matches provider-specific format pattern
     */
    validateProviderKey(provider: ProviderName, key: string): KeyValidationResult {
        const trimmed = key.trim();

        // Local providers don't need keys
        if (this.config.localProviders.has(provider)) {
            return { valid: true, provider, formatMatch: true };
        }

        // Empty key
        if (!trimmed) {
            return {
                valid: false,
                provider,
                formatMatch: false,
                reason: `API key for ${provider} is required but empty.`,
            };
        }

        // Basic format: printable ASCII, no whitespace
        if (!isValidKeyChars(trimmed)) {
            return {
                valid: false,
                provider,
                formatMatch: false,
                reason: 'Key contains invalid characters (whitespace or control characters).',
            };
        }

        // Length check
        const minLen = MIN_KEY_LENGTH[provider];
        if (trimmed.length < minLen) {
            return {
                valid: false,
                provider,
                formatMatch: false,
                reason: `Key is too short for ${provider} (minimum ${minLen} characters).`,
            };
        }

        if (trimmed.length > 512) {
            return {
                valid: false,
                provider,
                formatMatch: false,
                reason: 'Key exceeds maximum length (512 characters).',
            };
        }

        // Provider-specific format
        const pattern = KEY_FORMAT_PATTERNS[provider];
        const formatMatch = pattern.test(trimmed);

        if (!formatMatch) {
            return {
                valid: true, // Still "valid" — might be a custom key
                provider,
                formatMatch: false,
                reason: `Key format does not match expected ${provider} pattern. It may still work.`,
            };
        }

        return { valid: true, provider, formatMatch: true };
    }

    /**
     * Validate the currently stored key for a provider.
     * Combines format validation + optional live health check.
     */
    async validateStoredKey(
        provider: ProviderName,
        healthChecker?: (key: string) => Promise<boolean>,
    ): Promise<KeyValidationResult> {
        const secrets = await this.store.getProviderSecrets(provider);
        const key = secrets.primaryKey ?? '';
        const result = this.validateProviderKey(provider, key);

        if (result.valid && healthChecker && key) {
            try {
                result.liveCheck = await healthChecker(key);
                if (!result.liveCheck) {
                    result.reason = `Key passed format validation but failed live connectivity check.`;
                }
            } catch {
                result.liveCheck = false;
                result.reason = 'Live health check threw an error.';
            }
        }

        return result;
    }

    // ─── Key Rotation Tracking ────────────────────────────────────────────

    /** Record a successful API call for a provider key. */
    recordSuccess(provider: ProviderName, slot: 'primary' | 'fallback' = 'primary'): void {
        const entry = this.getRotation(provider, slot);
        entry.lastSuccessAt = new Date().toISOString();
        entry.consecutiveFailures = 0;
        this.rotationState.set(this.rotationKey(provider, slot), entry);
    }

    /** Record a failed API call for a provider key. */
    recordFailure(provider: ProviderName, slot: 'primary' | 'fallback' = 'primary'): void {
        const entry = this.getRotation(provider, slot);
        entry.lastFailureAt = new Date().toISOString();
        entry.consecutiveFailures += 1;
        this.rotationState.set(this.rotationKey(provider, slot), entry);
    }

    /** Check if a key slot is exhausted (too many consecutive failures). */
    isKeyExhausted(provider: ProviderName, slot: 'primary' | 'fallback' = 'primary'): boolean {
        const entry = this.getRotation(provider, slot);
        return entry.consecutiveFailures >= this.config.maxConsecutiveFailures;
    }

    /** Reset failure tracking for a provider key. */
    resetRotation(provider: ProviderName, slot: 'primary' | 'fallback' = 'primary'): void {
        const key = this.rotationKey(provider, slot);
        this.rotationState.delete(key);
    }

    /** Get rotation state for a key slot. */
    getRotationState(
        provider: ProviderName,
        slot: 'primary' | 'fallback' = 'primary',
    ): KeyRotationEntry {
        return { ...this.getRotation(provider, slot) };
    }

    // ─── Backend Proxy Enforcement ────────────────────────────────────────

    /**
     * Ensure remote providers route through backend proxy in production.
     * Throws if a remote provider is accessed without a proxy URL.
     */
    assertBackendOnly(provider: ProviderName, proxyUrl?: string): void {
        if (!this.config.enforceBackendProxy) return;
        if (this.config.localProviders.has(provider)) return;
        if (!isProduction()) return;
        if (proxyUrl) return;

        throw new Error(
            `Security violation: "${provider}" requires backend proxy in production. ` +
                `Set VITE_API_PROXY_URL or configure a proxy.`,
        );
    }

    /**
     * Validate that a provider's custom endpoint uses HTTPS (or is local).
     */
    assertSecureEndpoint(provider: ProviderName, endpoint: string): void {
        if (this.config.localProviders.has(provider)) {
            assertSecureEndpoint(endpoint, `${provider} endpoint`, { allowHttpLocalhost: true });
        } else {
            assertSecureEndpoint(endpoint, `${provider} endpoint`);
        }
    }

    // ─── Backward Compatibility ───────────────────────────────────────────

    /**
     * @deprecated Use setProviderSecrets() instead.
     * Kept for backward compatibility with the old KeyManager API.
     */
    async setKey(slot: string, rawKey: string): Promise<void> {
        const encrypted = await encrypt(rawKey.trim());
        if (!encrypted && rawKey.trim()) return;
        // Store in the underlying backend directly for legacy compat
        const legacyKey = `cinematifier-key:${slot}`;
        if (encrypted) {
            await this.store['backend'].set(legacyKey, encrypted);
        } else {
            await this.store['backend'].delete(legacyKey);
        }
    }

    /**
     * @deprecated Use getProviderKey() instead.
     */
    async getKey(slot: string): Promise<string> {
        const legacyKey = `cinematifier-key:${slot}`;
        const ciphertext = await this.store['backend'].get(legacyKey);
        if (!ciphertext) return '';
        const plaintext = await decrypt(ciphertext);
        return plaintext.trim();
    }

    /**
     * @deprecated Use clearProvider() instead.
     */
    removeKey(slot: string): void {
        const legacyKey = `cinematifier-key:${slot}`;
        // Fire-and-forget since legacy API was sync
        void this.store['backend'].delete(legacyKey);
    }

    /**
     * @deprecated Use assertBackendOnly() instead.
     */
    assertBackendOnlyUsage(provider: string, proxyUrl?: string): void {
        if (!isProduction()) return;
        if (!REMOTE_PROVIDERS.has(provider as ProviderName)) return;
        if (proxyUrl) return;
        throw new Error(`${provider} requires backend proxy usage in production.`);
    }

    // ─── Internal Helpers ─────────────────────────────────────────────────

    private rotationKey(provider: ProviderName, slot: 'primary' | 'fallback'): string {
        return `${provider}:${slot}`;
    }

    private getRotation(provider: ProviderName, slot: 'primary' | 'fallback'): KeyRotationEntry {
        const key = this.rotationKey(provider, slot);
        return (
            this.rotationState.get(key) ?? {
                provider,
                slot,
                setAt: new Date().toISOString(),
                consecutiveFailures: 0,
            }
        );
    }

    private initRotationEntry(provider: ProviderName, slot: 'primary' | 'fallback'): void {
        const key = this.rotationKey(provider, slot);
        if (!this.rotationState.has(key)) {
            this.rotationState.set(key, {
                provider,
                slot,
                setAt: new Date().toISOString(),
                consecutiveFailures: 0,
            });
        }
    }
}

// ─── STANDALONE VALIDATORS ────────────────────────────────────────────────────

/** Check if a raw key string contains only valid characters. */
export function isValidKeyChars(key: string): boolean {
    // Printable ASCII only, no whitespace or control characters
    return /^[\x21-\x7E]+$/.test(key);
}

/**
 * Basic key validation (format-only, no provider context).
 * Use KeyManager.validateProviderKey() for provider-aware validation.
 */
export function validateKey(rawKey: string): boolean {
    const key = rawKey.trim();
    if (!key) return false;
    if (key.length < 6 || key.length > 512) return false;
    return isValidKeyChars(key);
}

// ─── ENVIRONMENT HELPERS ──────────────────────────────────────────────────────

function isProduction(): boolean {
    try {
        return import.meta.env.PROD === true;
    } catch {
        return false;
    }
}
