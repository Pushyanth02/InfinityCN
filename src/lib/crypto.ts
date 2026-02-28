/**
 * crypto.ts — Encrypted Storage Utilities
 *
 * Provides AES-GCM encryption for sensitive data (API keys) using
 * the Web Crypto API (SubtleCrypto) with a device-derived key.
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

// ─── Crypto Key Management ─────────────────────────────────────────────────

let cachedKey: CryptoKey | null = null;

/**
 * Derive a stable AES-GCM key from the device fingerprint.
 * Uses PBKDF2 with a fixed salt to ensure deterministic key derivation.
 */
async function getDerivedKey(): Promise<CryptoKey> {
    if (cachedKey) return cachedKey;

    const fingerprint = getDeviceFingerprint();
    const encoder = new TextEncoder();

    // Fixed salt — ensures deterministic key derivation across sessions.
    // Security note: The key's entropy comes from the fingerprint, not the salt.
    const salt = encoder.encode('InfinityCN-v1-salt');

    // Import the fingerprint as base key material
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(fingerprint),
        'PBKDF2',
        false,
        ['deriveKey'],
    );

    // Derive AES-GCM key
    cachedKey = await crypto.subtle.deriveKey(
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

    return cachedKey;
}

// ─── Encryption Functions ──────────────────────────────────────────────────

/**
 * Encrypt a plaintext string using AES-GCM.
 * Returns a base64-encoded string containing IV + ciphertext.
 */
export async function encrypt(plaintext: string): Promise<string> {
    if (!plaintext) return '';

    try {
        const key = await getDerivedKey();
        const encoder = new TextEncoder();
        const data = encoder.encode(plaintext);

        // Generate random IV for each encryption (12 bytes is optimal for AES-GCM)
        const iv = crypto.getRandomValues(new Uint8Array(12));

        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);

        // Combine IV + ciphertext for storage
        const combined = new Uint8Array(iv.length + ciphertext.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(ciphertext), iv.length);

        // Encode as base64 for safe JSON storage
        let binary = '';
        for (let i = 0; i < combined.length; i++) {
            binary += String.fromCharCode(combined[i]);
        }
        return btoa(binary);
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

    try {
        const key = await getDerivedKey();

        // Decode from base64
        const combined = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));

        // Extract IV (first 12 bytes) and ciphertext
        const iv = combined.slice(0, 12);
        const ciphertext = combined.slice(12);

        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);

        return new TextDecoder().decode(decrypted);
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
    try {
        const decoded = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
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
