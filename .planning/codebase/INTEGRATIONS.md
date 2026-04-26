# System Integrations: InfinityCN

## Core Connectivity Map

**Analysis Date:** 2026-04-13
**Environment:** Browser-first runtime with optional cloud AI providers

---

## AI Provider Integrations

- OpenAI
- Anthropic
- Gemini
- Groq
- DeepSeek
- Ollama (local)
- Chrome AI (Gemini Nano)

Provider orchestration lives in `src/lib/ai/`.

## External Discovery + Metadata APIs

- Open Library
- Google Books API
- Gutendex
- Jikan (Manga)
- Kitsu (Manga/Manhwa/Manhua)
- Wikipedia Summary API
- DictionaryAPI + Datamuse (word lens)
- DummyJSON Quotes + Quotable (processing quotes)

Runtime API modules live in `src/lib/runtime/`.

## Local Processing + Storage Integrations

- Dexie (IndexedDB) for persistent book and progress data.
- localStorage for telemetry snapshots and encrypted configuration state.
- pdfjs-dist, fflate, and Tesseract.js for ingestion and OCR.
- Transformers.js for local embedding/offline pathways.

## UI + Runtime Integration Boundaries

- Components: UI only (`src/components/`).
- Hooks: orchestration (`src/hooks/`).
- Business logic: runtime/engine modules (`src/lib/runtime`, `src/lib/engine`).

---

_Integration audit: 2026-04-13_

---

## Documentation Map Reference

- Master repository map: `/home/runner/work/InfinityCN/InfinityCN/README.md`
- Planning overview: `/home/runner/work/InfinityCN/InfinityCN/.planning/PROJECT.md`, `/home/runner/work/InfinityCN/InfinityCN/.planning/ROADMAP.md`, `/home/runner/work/InfinityCN/InfinityCN/.planning/STATE.md`
- Codebase map set: `/home/runner/work/InfinityCN/InfinityCN/.planning/codebase/STRUCTURE.md`, `/home/runner/work/InfinityCN/InfinityCN/.planning/codebase/ARCHITECTURE.md`, `/home/runner/work/InfinityCN/InfinityCN/.planning/codebase/INTEGRATIONS.md`
