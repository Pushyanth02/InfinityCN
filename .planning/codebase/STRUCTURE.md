# Codebase Structure: InfinityCN
## Global Architecture Map

**Analysis Date:** 2026-03-30
**Architecture:** Hybrid Node/.NET System

---

## 📁 Root Directory
- `.planning/` — GSD Protocol and project vision (RULES.md, PROJECT.md, Codebase Map).
- `dotnet/` — Cinematic engine solution (.NET 9.0 Solution).
  - `src/` — Main service projects (API, Core, Infrastructure, Worker).
  - `tests/` — NUnit and xUnit verification projects.
- `server/` — Express API gateway and job manager.
  - `src/` — Core Node.js services and worker scripts.
- `src/` — React frontend and browser-side narrative engine.
  - `components/` — UI elements and specific narrative renderers.
  - `lib/` — Business logical units (Cinematifier Engine).
  - `store/` — Zustand state containers.
- `public/` — Static assets and PWA manifest.
- `tests/` — Vitest frontend integration tests.

## 📁 The Cinematifier Engine (`src/lib/cinematifier`)
- `pipeline.ts` — Main orchestrator for scene processing.
- `aiEngine.ts` — Routing and validation for multiple AI providers.
- `offlineEngine.ts` — Local-ML fallback using Transformers.js.
- `parser.ts` — Extraction of raw story text from multiple formats.
- `sceneDetection.ts` — Core logic for identifying narrative boundaries.
- `sentimentTracker.ts` — Tracking of character emotion and narrative tension.
- `pacingAnalyzer.ts` — Analysis of readability and narrative flow.

## 📁 Backend Services (`server/src/services`)
- `redis/` — Session management and state synchronization.
- `rabbitmq/` — Distributed job queuing.
- `aiProxy/` — Secure proxying to cloud AI providers.

---
*Structure audit: 2026-03-30*
