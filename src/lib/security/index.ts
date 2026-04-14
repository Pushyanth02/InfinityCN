/**
 * security/index.ts — Security Layer Barrel Export
 */

// Types
export type {
    ProviderName,
    ProviderSecrets,
    KeyValidationResult,
    KeyRotationEntry,
    KeyManagerConfig,
    SecretStoreBackend,
} from './types';

// Crypto primitives
export { encrypt, decrypt, deobfuscateLegacy, isLegacyEncryption } from './crypto';

// Secret store
export {
    SecretStore,
    MemoryStoreBackend,
    LocalStorageBackend,
    EnvStoreBackend,
    LayeredStoreBackend,
} from './secretStore';

// Key manager
export { KeyManager, validateKey, isValidKeyChars, encryptKey, decryptKey } from './keyManager';

// AI security helpers
export { normalizeApiKey, assertSecureEndpoint } from './aiSecurity';
