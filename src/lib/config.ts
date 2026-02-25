/**
 * config.ts — Application configuration
 */

/**
 * MangaDex API Base URL
 * In development, requests are proxied through Vite to avoid CORS issues.
 * In production, requests go directly to the MangaDex API.
 */
export const MANGADEX_API_URL = import.meta.env.DEV ? '/mangadex-api' : 'https://api.mangadex.org';
