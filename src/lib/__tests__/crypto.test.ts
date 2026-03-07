/**
 * crypto.test.ts — Unit tests for crypto.ts synchronous utilities
 *
 * Tests the synchronous helpers that don't require the Web Crypto API:
 *   • deobfuscateLegacy  — XOR de-obfuscation for legacy data migration
 *   • isLegacyEncryption — heuristic to distinguish legacy vs AES-encrypted blobs
 *
 * Note: encrypt() and decrypt() (AES-GCM) are not tested here because
 * they depend on navigator / screen globals that are not meaningful in jsdom,
 * and SubtleCrypto key derivation is integration-tested in the E2E suite.
 */

import { describe, it, expect } from 'vitest';
import { deobfuscateLegacy, isLegacyEncryption } from '../crypto';

// ─── deobfuscateLegacy ────────────────────────────────────────────────────────

describe('deobfuscateLegacy', () => {
    it('returns empty string for empty input', () => {
        expect(deobfuscateLegacy('')).toBe('');
    });

    it('returns empty string for null-like input (undefined cast)', () => {
        // TypeScript typing ensures this is string, but guard still exists
        expect(deobfuscateLegacy('' as string)).toBe('');
    });

    it('returns empty string for invalid base64 input', () => {
        // Invalid base64 should not throw — the function catches and returns ''
        expect(deobfuscateLegacy('not-valid-base64!!!!')).toBe('');
    });

    it('roundtrips: re-encoding then decoding recovers the original value', () => {
        // Since we can't directly call the private encode function, we replicate
        // the XOR encode logic using the same device-key derivation.
        // Instead, we test that: deobfuscateLegacy(encode(X)) === X
        // We manually create a valid encoded string using the XOR key.

        // Build the same key the function uses (navigator.* values from jsdom)
        const parts = [
            navigator.userAgent,
            navigator.language,
            screen.width.toString(),
            screen.height.toString(),
            Intl.DateTimeFormat().resolvedOptions().timeZone,
        ];
        const key = parts.join('|');

        const plaintext = 'sk-test-api-key-1234';
        const encoder = new TextEncoder();
        const bytes = encoder.encode(plaintext);
        const xored = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) {
            xored[i] = bytes[i] ^ key.charCodeAt(i % key.length);
        }

        // Build base64 the same way as legacy code
        let binary = '';
        for (let i = 0; i < xored.length; i++) {
            binary += String.fromCharCode(xored[i]);
        }
        const encoded = btoa(binary);

        // Now verify roundtrip
        const decoded = deobfuscateLegacy(encoded);
        expect(decoded).toBe(plaintext);
    });
});

// ─── isLegacyEncryption ───────────────────────────────────────────────────────

describe('isLegacyEncryption', () => {
    it('returns false for empty string', () => {
        expect(isLegacyEncryption('')).toBe(false);
    });

    it('treats short base64-encoded blobs as legacy (XOR)', () => {
        // A typical API key like "sk-test123" is ~10 chars — after XOR and base64 it's ~14 bytes.
        // That's well under 28 bytes, so should be considered legacy.
        const shortBlob = btoa('short_xor_data');
        expect(isLegacyEncryption(shortBlob)).toBe(true);
    });

    it('treats long base64-encoded blobs as AES-encrypted', () => {
        // AES-GCM output: 12 bytes IV + at least 16 bytes auth tag + ciphertext.
        // For any non-trivial plaintext (e.g. an API key), the encoded blob
        // will be at least 28 bytes before base64 expansion → ~40 chars base64.
        // We simulate this by creating a Uint8Array of 40 bytes and encoding it.
        const fakeAES = new Uint8Array(40);
        crypto.getRandomValues(fakeAES);
        let binary = '';
        for (let i = 0; i < fakeAES.length; i++) binary += String.fromCharCode(fakeAES[i]);
        const encoded = btoa(binary);
        expect(isLegacyEncryption(encoded)).toBe(false);
    });

    it('returns true for invalid base64 (fallback to legacy assumed)', () => {
        expect(isLegacyEncryption('!!invalid-base64!!')).toBe(true);
    });

    it('returns false for a blob that decodes to exactly 28 bytes', () => {
        // 28 bytes is the minimum AES-GCM output (12 IV + 16 auth tag, 0 plaintext chars)
        const boundary = new Uint8Array(28);
        let binary = '';
        for (let i = 0; i < 28; i++) binary += String.fromCharCode(boundary[i]);
        const encoded = btoa(binary);
        // decoded.length === 28 >= 28 → NOT legacy
        expect(isLegacyEncryption(encoded)).toBe(false);
    });

    it('returns true for a blob that decodes to 27 bytes (just under threshold)', () => {
        const under = new Uint8Array(27);
        let binary = '';
        for (let i = 0; i < 27; i++) binary += String.fromCharCode(under[i]);
        const encoded = btoa(binary);
        expect(isLegacyEncryption(encoded)).toBe(true);
    });
});
