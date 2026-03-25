# Technical Concerns

**Analysis Date:** 2026-03-25

## Performance & Scale

- **Large Documents:** Processing 100k+ words on the client can freeze the UI. The server job queue exists but requires robust offline/online synchronization.
- **IndexedDB Limits:** Very large books with heavy metadata (SFX, images) may hit storage quotas on mobile/safari.

## AI Cost & Efficiency

- **Token Consumption:** High-density cinematification (SFX per scene) is token-heavy.
- **Redundant Processing:** If a user re-uploads a book, we should ideally recognize the hash and skip AI transformation (implemented in Redis cache but could be enhanced on client-side).

## Engine Reliability

- **AI Delusions:** Sometimes AI may return invalid JSON or corrupt the narrative flow. Robust validation and fallback to "Original Text" are necessary.
- **SFX Sync:** Ensuring SFX triggers exactly when the user scrolls to a specific block (scroll-spy latency).

## Offline Support

- **Runtime ML:** `@xenova/transformers` (ONNX) is heavy (~50MB+ models). Initial download latency must be managed with clear UI progress.
- **PWA Sync:** Ensuring service worker updates don't interrupt active processing.

## Maintainability

- **Mixed Layers:** Avoid putting UI logic into the cinematification pipeline.
- **Dependency Bloat:** PDF.js and Tesseract.js are large; ensure they remain as lazy-loaded manual chunks in Vite.

---
*Concern audit: 2026-03-25*
