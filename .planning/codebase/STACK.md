# Technology Stack: InfinityCN

## The Cinematifier Engine

**Analysis Date:** 2026-04-13
**Version:** 15.0.0

---

## 💻 Frontend Core

- **Framework:** React 19.2.4 (Strict Mode enabled)
- **Tooling:** Vite 8.x (building for modern web and PWA)
- **State:** Zustand 5.0.11 (Atomic and fast global state management)
- **Database:** Dexie 4.3.0 (IndexedDB source of truth for the reader)
- **UI & Animations:** Framer Motion 12.35.2 (High-purity, fluid narrative transitions)
- **Icons:** Lucide React

## 🚀 Native ML & AI

- **Transformers.js:** Browser-resident ML for embeddings and offline assist paths.
- **Tesseract.js:** Optical character recognition for physical document scanning.
- **PDF.js:** Client-side extraction of raw story data.
- **AI Providers:** OpenAI, Anthropic, Gemini, Groq, DeepSeek, Ollama, and Chrome AI.

## 🌐 External API Integrations

- **Story Discovery:** Open Library, Google Books, Gutendex, Jikan, Kitsu.
- **Word Lens:** DictionaryAPI + Datamuse.
- **Metadata Enrichment:** Wikipedia summary API.
- **Quotes:** DummyJSON + Quotable with offline fallback.

## ⚙️ Testing & Quality

- **Vitest:** Primary testing framework for the React application and core pipeline logic.
- **Testing Library:** DOM verification for narrative elements.
- **Husky & Lint-Staged:** Pre-commit enforcement of "Clean Code" rules.

---

_Stack audit: 2026-04-13_
