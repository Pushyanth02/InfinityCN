import { describe, it, expect, vi } from 'vitest';
import { KeyManager, decryptKey, encryptKey, validateKey } from '../security/keyManager';

vi.mock('../security/crypto', () => ({
    encrypt: vi.fn(async (value: string) => `enc:${value}`),
    decrypt: vi.fn(async (value: string) => value.replace(/^enc:/, '')),
}));

describe('keyManager security helpers', () => {
    it('validateKey accepts plausible API keys', () => {
        expect(validateKey('sk-test-key-1234567890')).toBe(true);
    });

    it('validateKey rejects invalid values', () => {
        expect(validateKey('')).toBe(false);
        expect(validateKey('short')).toBe(false);
        expect(validateKey('key with spaces 1234567890')).toBe(false);
    });

    it('encryptKey/decryptKey roundtrip with normalized values', async () => {
        const encrypted = await encryptKey('  sk-test-key-1234567890  ');
        expect(encrypted).toBe('enc:sk-test-key-1234567890');

        const decrypted = await decryptKey(encrypted);
        expect(decrypted).toBe('sk-test-key-1234567890');
    });
});

describe('KeyManager secure storage', () => {
    it('stores encrypted key and decrypts on read', async () => {
        const storage = new Map<string, string>();
        const keyManager = new KeyManager({
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => {
                storage.set(key, value);
            },
            removeItem: (key: string) => {
                storage.delete(key);
            },
        });

        await keyManager.setKey('openai', 'sk-test-key-1234567890');

        expect(storage.get('cinematifier-key:openai')).toBe('enc:sk-test-key-1234567890');
        await expect(keyManager.getKey('openai')).resolves.toBe('sk-test-key-1234567890');

        keyManager.removeKey('openai');
        expect(storage.has('cinematifier-key:openai')).toBe(false);
    });
});

