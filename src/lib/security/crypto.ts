/**
 * crypto.ts — Encrypted Storage Utilities
 *
 * Provides AES-GCM encryption for sensitive data (API keys) using
 * the Web Crypto API (SubtleCrypto) with a local install secret.
 *
 * The key is derived from browser fingerprint, ensuring:
 * - API keys are encrypted at rest in localStorage
 * - Same browser can always decrypt its own data
 * - Data is opaque to anyone reading raw storage
 */

// ─── Device Fingerprint for Key Derivation ─────────────────────────────────

function getDeviceFingerprint(): string {
    const parts = [
        navigator.userAgent,
        navigator.language,
        screen.width.toString(),
        screen.height.toString(),
        screen.colorDepth.toString(),
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        navigator.hardwareConcurrency?.toString() ?? '4',
    ];
    return parts.join('|');
}

const INSTALL_SECRET_KEY = 'cinematifier-install-secret';
const ENCRYPTION_PREFIX = 'v2:';

function randomBase64(bytes = 32): string {
    const data = crypto.getRandomValues(new Uint8Array(bytes));
    let binary = '';
    for (let i = 0; i < data.length; i++) {
        binary += String.fromCharCode(data[i]);
    }
    return btoa(binary);
}

function getInstallSecret(): string {
    try {
        const existing = localStorage.getItem(INSTALL_SECRET_KEY);
        if (existing) return existing;

        const created = randomBase64(32);
        localStorage.setItem(INSTALL_SECRET_KEY, created);
        return created;
    } catch {
        // localStorage can fail in privacy mode; fallback still improves over
        // static fingerprint-only derivation for this runtime session.
        return randomBase64(32);
    }
}

function combineIvAndCiphertext(iv: Uint8Array, ciphertext: ArrayBuffer): Uint8Array {
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return combined;
}

function encodeBase64(data: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < data.length; i++) {
        binary += String.fromCharCode(data[i]);
    }
    return btoa(binary);
}

function decodeBase64(encoded: string): Uint8Array {
    return Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
}

// ─── Crypto Key Management ─────────────────────────────────────────────────

let cachedKeyV2: CryptoKey | null = null;
let cachedKeyV1: CryptoKey | null = null;

/**
 * Derive the current AES-GCM key from install secret + fingerprint.
 */
async function getDerivedKeyV2(): Promise<CryptoKey> {
    if (cachedKeyV2) return cachedKeyV2;

    const secret = getInstallSecret();
    const fingerprint = getDeviceFingerprint();
    const encoder = new TextEncoder();

    const salt = encoder.encode('InfinityCN-v2-salt');

    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(`${secret}|${fingerprint}`),
        'PBKDF2',
        false,
        ['deriveKey'],
    );

    cachedKeyV2 = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations: 250_000,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );

    return cachedKeyV2;
}

/**
 * Legacy AES key derivation (v1) kept for transparent migration.
 */
async function getDerivedKeyV1(): Promise<CryptoKey> {
    if (cachedKeyV1) return cachedKeyV1;

    const fingerprint = getDeviceFingerprint();
    const encoder = new TextEncoder();
    const salt = encoder.encode('InfinityCN-v1-salt');

    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(fingerprint),
        'PBKDF2',
        false,
        ['deriveKey'],
    );

    cachedKeyV1 = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations: 100_000,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );

    return cachedKeyV1;
}

// ─── Encryption Functions ──────────────────────────────────────────────────

/**
 * Encrypt a plaintext string using AES-GCM.
 * Returns a base64-encoded string containing IV + ciphertext.
 */
export async function encrypt(plaintext: string): Promise<string> {
    if (!plaintext) return '';

    try {
        const key = await getDerivedKeyV2();
        const encoder = new TextEncoder();
        const data = encoder.encode(plaintext);

        // Generate random IV for each encryption (12 bytes is optimal for AES-GCM)
        const iv = crypto.getRandomValues(new Uint8Array(12));

        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);

        const combined = combineIvAndCiphertext(iv, ciphertext);
        return `${ENCRYPTION_PREFIX}${encodeBase64(combined)}`;
    } catch (error) {
        console.error('[Crypto] Encryption failed:', error);
        // Fall back to empty string on error — don't expose plaintext
        return '';
    }
}

/**
 * Decrypt a base64-encoded encrypted string.
 * Returns the original plaintext or empty string on failure.
 */
export async function decrypt(encoded: string): Promise<string> {
    if (!encoded) return '';

    const tryDecrypt = async (
        payload: string,
        getKey: () => Promise<CryptoKey>,
    ): Promise<string> => {
        const key = await getKey();
        const combined = decodeBase64(payload);
        const iv = combined.slice(0, 12);
        const ciphertext = combined.slice(12);

        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
        return new TextDecoder().decode(decrypted);
    };

    try {
        if (encoded.startsWith(ENCRYPTION_PREFIX)) {
            return await tryDecrypt(encoded.slice(ENCRYPTION_PREFIX.length), getDerivedKeyV2);
        }

        // Migration path: old AES payload without prefix
        try {
            return await tryDecrypt(encoded, getDerivedKeyV1);
        } catch {
            // As a fallback, attempt current key in case prefix was stripped
            return await tryDecrypt(encoded, getDerivedKeyV2);
        }
    } catch {
        // Decryption failure — likely corrupted data or different device
        console.warn('[Crypto] Decryption failed, clearing stored value');
        return '';
    }
}

// ─── Synchronous Fallback (for legacy data migration) ──────────────────────

/**
 * Simple XOR obfuscation — used ONLY to read legacy data during migration.
 * New data should always use the async encrypt/decrypt functions.
 */
function getDeviceKeyLegacy(): string {
    const parts = [
        navigator.userAgent,
        navigator.language,
        screen.width.toString(),
        screen.height.toString(),
        Intl.DateTimeFormat().resolvedOptions().timeZone,
    ];
    return parts.join('|');
}

export function deobfuscateLegacy(encoded: string): string {
    if (!encoded) return '';
    try {
        const key = getDeviceKeyLegacy();
        const raw = atob(encoded);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) {
            bytes[i] = raw.charCodeAt(i) ^ key.charCodeAt(i % key.length);
        }
        return new TextDecoder().decode(bytes);
    } catch {
        return ''; // Corrupted or from a different device
    }
}

/**
 * Detect if a stored value is legacy XOR-obfuscated or AES-encrypted.
 * AES-encrypted values are longer (IV + ciphertext) and have different structure.
 */
export function isLegacyEncryption(encoded: string): boolean {
    if (!encoded) return false;
    if (encoded.startsWith(ENCRYPTION_PREFIX)) return false;
    try {
        const decoded = decodeBase64(encoded);
        // AES-GCM encrypted data: 12 bytes IV + at least 16 bytes auth tag
        // Minimum 28 bytes for any non-empty ciphertext
        // Legacy XOR would typically be shorter for API keys
        // Also check: legacy XOR decoding produces readable ASCII
        if (decoded.length >= 28) {
            // Likely AES-encrypted
            return false;
        }
        // Short encoded values are likely legacy
        return true;
    } catch {
        return true; // Assume legacy on decode error
    }
}
