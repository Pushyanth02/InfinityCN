import type { AIProvider } from '../ai/types';
import { encrypt, decrypt } from './crypto';

const KEY_STORAGE_PREFIX = 'cinematifier-key:';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function getBrowserStorage(): StorageLike | null {
    if (typeof window === 'undefined') return null;
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

export function validateKey(rawKey: string): boolean {
    const key = rawKey.trim();
    if (!key) return false;
    if (key.length < 6 || key.length > 512) return false;
    // Disallow whitespace/control chars while allowing provider-specific symbols.
    return /^[\x21-\x7E]+$/.test(key);
}

export async function encryptKey(rawKey: string): Promise<string> {
    const key = rawKey.trim();
    if (!validateKey(key)) return '';
    return encrypt(key);
}

export async function decryptKey(encryptedKey: string): Promise<string> {
    if (!encryptedKey) return '';
    const plain = await decrypt(encryptedKey);
    return plain.trim();
}

function isRemoteApiProvider(provider: AIProvider): boolean {
    return (
        provider === 'gemini' ||
        provider === 'openai' ||
        provider === 'anthropic' ||
        provider === 'groq' ||
        provider === 'deepseek'
    );
}

/**
 * API-key manager with encrypted local persistence.
 * In production, remote-provider keys are expected to be consumed through backend proxy usage.
 */
export class KeyManager {
    private readonly storage: StorageLike | null;

    constructor(storage?: StorageLike | null) {
        this.storage = storage ?? getBrowserStorage();
    }

    private storageKey(slot: string): string {
        return `${KEY_STORAGE_PREFIX}${slot}`;
    }

    async setKey(slot: string, rawKey: string): Promise<void> {
        if (!this.storage) return;
        const encrypted = await encryptKey(rawKey);
        this.storage.setItem(this.storageKey(slot), encrypted);
    }

    async getKey(slot: string): Promise<string> {
        if (!this.storage) return '';
        const encrypted = this.storage.getItem(this.storageKey(slot));
        return decryptKey(encrypted ?? '');
    }

    removeKey(slot: string): void {
        if (!this.storage) return;
        this.storage.removeItem(this.storageKey(slot));
    }

    /**
     * Ensures production builds use backend proxy for remote API-key providers.
     */
    assertBackendOnlyUsage(provider: AIProvider, proxyUrl?: string): void {
        if (!import.meta.env.PROD) return;
        if (!isRemoteApiProvider(provider)) return;
        if (proxyUrl) return;
        throw new Error(`${provider} requires backend proxy usage in production.`);
    }
}
