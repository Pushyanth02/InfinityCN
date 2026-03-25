# Codebase Structure

**Analysis Date:** 2026-03-25

## Root Directory

- `.planning/` — GSD Protocol integration (Requirements, Roadmap, State, Codebase Map)
- `.gemini/` — Project-specific AI rules (`gemini.md`) and configuration
- `dotnet/` — Cinematic engine core (.NET 9.0 Solution)
- `public/` — Static assets (SFX, Icons, PWA manifest)
- `server/` — Express backend (Job Manager, AI Proxy, Workers)
- `src/` — React frontend source
- `tests/` — High-level integration tests

## Core Components (`src/`)

- `src/components/` — UI components
  - `ui/` — Base design system (Buttons, Cards, Modals)
  - `CinematifierApp.tsx` — Main application shell
  - `CinematicReader.tsx` — Narrative rendering engine
  - `UploadZone.tsx` — File intake
- `src/hooks/` — Logic-specific custom hooks
  - `useAmbientAudio.ts` — SFX orchestration
  - `useFileProcessing.ts` — Processing pipeline hook
  - `useReadingProgress.ts` — IndexedDB sync
- `src/lib/` — Business logic and utilities
  - `cinematifier/` — **The Core Engine**
    - `pipeline.ts` — Main orchestrator
    - `aiEngine.ts` — AI model routing
    - `offlineEngine.ts` — Local ML fallback
    - `parser.ts` — Multiformat text extraction
  - `cinematifierDb.ts` — Dexie/IndexedDB configuration
- `src/store/` — Zustand state containers
- `src/styles/` — Global and utility CSS
- `src/test/` — Vitest setup and global mocks

## Backend (`server/`)

- `server/src/`
  - `services/` — Business services (Redis, RabbitMQ, cache, AI routing)
  - `routes/` — API endpoint definitions
  - `middleware/` — Security, rate-limiting, error handling
  - `index.ts` — API Server entry
  - `worker.ts` — Job worker entry
  - `types.ts` — Shared backend interfaces

## Engine (`dotnet/`)

- `dotnet/Cinematifier/` — C# core logic (likely used for heavy document processing or legacy integration)

---
*Structure mapping: 2026-03-25*
