import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    KeyManager,
    validateKey,
    isValidKeyChars,
    encryptKey,
    decryptKey,
} from '../security/keyManager';
import {
    SecretStore,
    MemoryStoreBackend,
    EnvStoreBackend,
    LayeredStoreBackend,
} from '../security/secretStore';
import type { ProviderSecrets } from '../security/types';

// ─── Mock crypto to isolate key manager logic from AES-GCM ────────────────────

vi.mock('../security/crypto', () => ({
    encrypt: vi.fn(async (value: string) => (value ? `enc:${value}` : '')),
    decrypt: vi.fn(async (value: string) => (value ? value.replace(/^enc:/, '') : '')),
    deobfuscateLegacy: vi.fn((value: string) => value),
    isLegacyEncryption: vi.fn(() => false),
}));

// ─── STANDALONE VALIDATORS ────────────────────────────────────────────────────

describe('validateKey (standalone)', () => {
    it('accepts valid API keys', () => {
        expect(validateKey('sk-test-key-1234567890')).toBe(true);
        expect(validateKey('AIzaSyExample1234567890abcdefghijklmn')).toBe(true);
        expect(validateKey('gsk_abcdefghijklmnopqrstuv')).toBe(true);
    });

    it('rejects empty strings', () => {
        expect(validateKey('')).toBe(false);
        expect(validateKey('   ')).toBe(false);
    });

    it('rejects keys shorter than 6 characters', () => {
        expect(validateKey('short')).toBe(false);
        expect(validateKey('ab')).toBe(false);
    });

    it('rejects keys with whitespace', () => {
        expect(validateKey('key with spaces 1234567890')).toBe(false);
        expect(validateKey('key\twith\ttabs1234567890')).toBe(false);
    });

    it('rejects keys longer than 512 characters', () => {
        const longKey = 'a'.repeat(513);
        expect(validateKey(longKey)).toBe(false);
    });

    it('accepts max-length keys', () => {
        const maxKey = 'a'.repeat(512);
        expect(validateKey(maxKey)).toBe(true);
    });
});

describe('isValidKeyChars', () => {
    it('allows printable ASCII', () => {
        expect(isValidKeyChars('sk-ant-api03_key.test')).toBe(true);
    });

    it('rejects whitespace', () => {
        expect(isValidKeyChars('no spaces')).toBe(false);
    });

    it('rejects control characters', () => {
        expect(isValidKeyChars('key\x00value')).toBe(false);
    });
});

// ─── encryptKey / decryptKey ──────────────────────────────────────────────────

describe('encryptKey / decryptKey', () => {
    it('roundtrips with trimming', async () => {
        const encrypted = await encryptKey('  sk-test-key-1234567890  ');
        expect(encrypted).toBe('enc:sk-test-key-1234567890');

        const decrypted = await decryptKey(encrypted);
        expect(decrypted).toBe('sk-test-key-1234567890');
    });

    it('returns empty for invalid keys', async () => {
        const encrypted = await encryptKey('short');
        expect(encrypted).toBe('');
    });

    it('returns empty for empty input', async () => {
        expect(await decryptKey('')).toBe('');
    });
});

// ─── SECRET STORE ─────────────────────────────────────────────────────────────

describe('SecretStore', () => {
    let backend: MemoryStoreBackend;
    let store: SecretStore;

    beforeEach(() => {
        backend = new MemoryStoreBackend();
        store = new SecretStore(backend);
    });

    it('encrypts on write and decrypts on read', async () => {
        await store.setSecret('test-slot', 'my-secret-key');

        // Backend stores encrypted value
        const raw = await backend.get('test-slot');
        expect(raw).toBe('enc:my-secret-key');

        // Store decrypts on read
        const decrypted = await store.getSecret('test-slot');
        expect(decrypted).toBe('my-secret-key');
    });

    it('clears slot when value is empty', async () => {
        await store.setSecret('test-slot', 'value');
        expect(await backend.has('test-slot')).toBe(true);

        await store.setSecret('test-slot', '');
        expect(await backend.has('test-slot')).toBe(false);
    });

    it('clears slot when value is undefined', async () => {
        await store.setSecret('test-slot', 'value');
        await store.setSecret('test-slot', undefined);
        expect(await backend.has('test-slot')).toBe(false);
    });

    it('returns empty string for missing keys', async () => {
        expect(await store.getSecret('nonexistent')).toBe('');
    });

    it('handles provider-level secrets', async () => {
        const secrets: ProviderSecrets = {
            primaryKey: 'pk-123',
            fallbackKey: 'fk-456',
            endpoint: 'https://api.example.com',
        };

        await store.setProviderSecrets('openai', secrets);
        const loaded = await store.getProviderSecrets('openai');

        expect(loaded.primaryKey).toBe('pk-123');
        expect(loaded.fallbackKey).toBe('fk-456');
        expect(loaded.endpoint).toBe('https://api.example.com');
    });

    it('clearProvider removes all provider slots', async () => {
        await store.setProviderSecrets('gemini', {
            primaryKey: 'pk',
            fallbackKey: 'fk',
        });

        await store.clearProvider('gemini');
        const loaded = await store.getProviderSecrets('gemini');

        expect(loaded.primaryKey).toBeUndefined();
        expect(loaded.fallbackKey).toBeUndefined();
    });
});

// ─── ENV STORE BACKEND ────────────────────────────────────────────────────────

describe('EnvStoreBackend', () => {
    it('reads from injected env source', async () => {
        const envSource = {
            ICN_SECRET_OPENAI_PRIMARY: 'enc:env-key-value',
        };
        const env = new EnvStoreBackend(envSource);

        expect(await env.get('icn-secret:openai:primary')).toBe('enc:env-key-value');
        expect(await env.has('icn-secret:openai:primary')).toBe(true);
    });

    it('returns null for missing vars', async () => {
        const env = new EnvStoreBackend({});
        expect(await env.get('icn-secret:openai:primary')).toBeNull();
        expect(await env.has('icn-secret:openai:primary')).toBe(false);
    });

    it('set is a no-op', async () => {
        const env = new EnvStoreBackend({});
        await env.set('key', 'value'); // Should not throw
    });
});

// ─── LAYERED STORE BACKEND ────────────────────────────────────────────────────

describe('LayeredStoreBackend', () => {
    it('reads from first layer with value', async () => {
        const env = new EnvStoreBackend({
            ICN_SECRET_OPENAI_PRIMARY: 'env-value',
        });
        const memory = new MemoryStoreBackend();
        await memory.set('icn-secret:openai:primary', 'memory-value');

        const layered = new LayeredStoreBackend([env, memory], memory);

        // Env takes priority
        expect(await layered.get('icn-secret:openai:primary')).toBe('env-value');
    });

    it('falls through to next layer if first is empty', async () => {
        const env = new EnvStoreBackend({});
        const memory = new MemoryStoreBackend();
        await memory.set('test-key', 'memory-value');

        const layered = new LayeredStoreBackend([env, memory], memory);

        expect(await layered.get('test-key')).toBe('memory-value');
    });

    it('writes to writable layer only', async () => {
        const env = new EnvStoreBackend({});
        const memory = new MemoryStoreBackend();

        const layered = new LayeredStoreBackend([env, memory], memory);
        await layered.set('new-key', 'new-value');

        expect(memory.size).toBe(1);
        expect(await memory.get('new-key')).toBe('new-value');
    });
});

// ─── KEY MANAGER ──────────────────────────────────────────────────────────────

describe('KeyManager', () => {
    let manager: KeyManager;
    let backend: MemoryStoreBackend;

    beforeEach(() => {
        backend = new MemoryStoreBackend();
        manager = new KeyManager(
            { enforceBackendProxy: false }, // Disable for tests
            backend,
        );
    });

    // ─── Provider Key Storage ─────────────────────────────────────────────

    describe('provider key storage', () => {
        it('stores and retrieves provider secrets', async () => {
            await manager.setProviderSecrets('openai', {
                primaryKey: 'sk-test123456789012345',
                fallbackKey: 'sk-fallback12345678901',
            });

            const secrets = await manager.getProviderSecrets('openai');
            expect(secrets.primaryKey).toBe('sk-test123456789012345');
            expect(secrets.fallbackKey).toBe('sk-fallback12345678901');
        });

        it('clears provider secrets', async () => {
            await manager.setProviderSecrets('gemini', { primaryKey: 'AIzaTest' });
            await manager.clearProvider('gemini');

            const secrets = await manager.getProviderSecrets('gemini');
            expect(secrets.primaryKey).toBeUndefined();
        });
    });

    // ─── Key Resolution ───────────────────────────────────────────────────

    describe('getProviderKey()', () => {
        it('returns primary key when available', async () => {
            await manager.setProviderSecrets('openai', {
                primaryKey: 'sk-primary12345678901234',
            });

            const key = await manager.getProviderKey('openai');
            expect(key).toBe('sk-primary12345678901234');
        });

        it('falls back when primary is exhausted', async () => {
            await manager.setProviderSecrets('openai', {
                primaryKey: 'sk-primary12345678901234',
                fallbackKey: 'sk-fallback1234567890123',
            });

            // Exhaust primary (5 failures)
            for (let i = 0; i < 5; i++) {
                manager.recordFailure('openai', 'primary');
            }

            const key = await manager.getProviderKey('openai');
            expect(key).toBe('sk-fallback1234567890123');
        });

        it('returns empty for local providers', async () => {
            const key = await manager.getProviderKey('ollama');
            expect(key).toBe('');
        });

        it('throws when no key is configured for remote provider', async () => {
            await expect(manager.getProviderKey('openai')).rejects.toThrow(/No API key configured/);
        });
    });

    // ─── Key Candidates ───────────────────────────────────────────────────

    describe('getKeyCandidates()', () => {
        it('returns primary and fallback in order', async () => {
            await manager.setProviderSecrets('openai', {
                primaryKey: 'sk-primary12345678901234',
                fallbackKey: 'sk-fallback1234567890123',
            });

            const candidates = await manager.getKeyCandidates('openai');
            expect(candidates).toEqual(['sk-primary12345678901234', 'sk-fallback1234567890123']);
        });

        it('deduplicates identical primary and fallback', async () => {
            await manager.setProviderSecrets('openai', {
                primaryKey: 'sk-same-key-12345678901',
                fallbackKey: 'sk-same-key-12345678901',
            });

            const candidates = await manager.getKeyCandidates('openai');
            expect(candidates).toEqual(['sk-same-key-12345678901']);
        });

        it('returns empty for local providers', async () => {
            const candidates = await manager.getKeyCandidates('ollama');
            expect(candidates).toEqual([]);
        });
    });

    // ─── Key Validation ───────────────────────────────────────────────────

    describe('validateProviderKey()', () => {
        it('validates OpenAI key format', () => {
            const valid = manager.validateProviderKey('openai', 'sk-test123456789012345678');
            expect(valid.valid).toBe(true);
            expect(valid.formatMatch).toBe(true);
        });

        it('validates Gemini key format', () => {
            const valid = manager.validateProviderKey(
                'gemini',
                'AIzaSyExample1234567890abcdefghijklmn',
            );
            expect(valid.valid).toBe(true);
            expect(valid.formatMatch).toBe(true);
        });

        it('validates Claude key format', () => {
            const valid = manager.validateProviderKey('claude', 'sk-ant-api03-test12345678901234');
            expect(valid.valid).toBe(true);
            expect(valid.formatMatch).toBe(true);
        });

        it('rejects empty keys for remote providers', () => {
            const result = manager.validateProviderKey('openai', '');
            expect(result.valid).toBe(false);
            expect(result.reason).toContain('required but empty');
        });

        it('accepts empty keys for local providers', () => {
            const result = manager.validateProviderKey('ollama', '');
            expect(result.valid).toBe(true);
        });

        it('flags mismatched format but still marks valid', () => {
            // A key that passes basic checks but not pattern match
            const result = manager.validateProviderKey(
                'openai',
                'not-an-openai-key-but-long-enough-format',
            );
            expect(result.valid).toBe(true);
            expect(result.formatMatch).toBe(false);
            expect(result.reason).toContain('does not match');
        });

        it('rejects keys with whitespace', () => {
            const result = manager.validateProviderKey('openai', 'sk-test key with spaces');
            expect(result.valid).toBe(false);
            expect(result.reason).toContain('invalid characters');
        });
    });

    // ─── Key Rotation ─────────────────────────────────────────────────────

    describe('key rotation tracking', () => {
        it('tracks success', () => {
            manager.recordSuccess('openai', 'primary');
            const state = manager.getRotationState('openai', 'primary');
            expect(state.consecutiveFailures).toBe(0);
            expect(state.lastSuccessAt).toBeDefined();
        });

        it('tracks consecutive failures', () => {
            manager.recordFailure('openai', 'primary');
            manager.recordFailure('openai', 'primary');
            manager.recordFailure('openai', 'primary');

            const state = manager.getRotationState('openai', 'primary');
            expect(state.consecutiveFailures).toBe(3);
            expect(state.lastFailureAt).toBeDefined();
        });

        it('resets failures on success', () => {
            manager.recordFailure('openai', 'primary');
            manager.recordFailure('openai', 'primary');
            manager.recordSuccess('openai', 'primary');

            const state = manager.getRotationState('openai', 'primary');
            expect(state.consecutiveFailures).toBe(0);
        });

        it('marks key as exhausted after max failures', () => {
            for (let i = 0; i < 5; i++) {
                manager.recordFailure('openai', 'primary');
            }
            expect(manager.isKeyExhausted('openai', 'primary')).toBe(true);
        });

        it('key is not exhausted below threshold', () => {
            manager.recordFailure('openai', 'primary');
            manager.recordFailure('openai', 'primary');
            expect(manager.isKeyExhausted('openai', 'primary')).toBe(false);
        });

        it('resetRotation clears failure state', () => {
            for (let i = 0; i < 5; i++) {
                manager.recordFailure('openai', 'primary');
            }
            expect(manager.isKeyExhausted('openai', 'primary')).toBe(true);

            manager.resetRotation('openai', 'primary');
            expect(manager.isKeyExhausted('openai', 'primary')).toBe(false);
        });
    });

    // ─── Backend Proxy Enforcement ────────────────────────────────────────

    describe('backend proxy enforcement', () => {
        it('does not throw when enforcement is disabled', () => {
            expect(() => manager.assertBackendOnly('openai')).not.toThrow();
        });

        it('does not throw for local providers', () => {
            const strict = new KeyManager({ enforceBackendProxy: true }, backend);
            expect(() => strict.assertBackendOnly('ollama')).not.toThrow();
        });
    });

    // ─── Legacy Backward Compatibility ────────────────────────────────────

    describe('legacy API (backward compat)', () => {
        it('setKey/getKey roundtrip', async () => {
            await manager.setKey('openai', 'sk-legacy-key-1234567890');
            const key = await manager.getKey('openai');
            expect(key).toBe('sk-legacy-key-1234567890');
        });

        it('removeKey deletes the key', async () => {
            await manager.setKey('openai', 'sk-legacy-key-1234567890');
            manager.removeKey('openai');
            const key = await manager.getKey('openai');
            expect(key).toBe('');
        });
    });
});
