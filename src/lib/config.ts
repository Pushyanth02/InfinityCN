/**
 * config.ts — Application configuration and embedded API keys
 * 
 * Contains constants that are embedded at build time for offline use.
 */

// ─── MANGADEX API CONFIGURATION ─────────────────────────────────────────────

/**
 * MangaDex API Client ID
 * This key is embedded for both offline and online use.
 * Used for authenticating with MangaDex API services.
 */
export const MANGADEX_CLIENT_ID = 'wFHsKkKWnOaIggbEMvAIEcLBRYlaF4kt';

/**
 * MangaDex API Base URL
 */
export const MANGADEX_API_URL = 'https://api.mangadex.org';

/**
 * MangaDex Auth URL
 */
export const MANGADEX_AUTH_URL = 'https://auth.mangadex.org';

// ─── APP CONFIGURATION ──────────────────────────────────────────────────────

export const APP_CONFIG = {
    /** Maximum file upload size in MB */
    maxFileSizeMB: 50,
    
    /** Supported file types for upload */
    supportedFileTypes: ['application/pdf', 'text/plain'],
    
    /** Cache TTL for AI responses (in ms) */
    aiCacheTtlMs: 30 * 60 * 1000, // 30 minutes
    
    /** Maximum cached AI responses */
    maxAiCacheSize: 50,
} as const;
