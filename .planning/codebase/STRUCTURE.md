# Codebase Structure: InfinityCN

## Global Architecture Map

**Analysis Date:** 2026-04-13
**Architecture:** Frontend-first modular runtime + engine pipeline

---

## Root Directory

- `.planning/` — GSD protocol docs, roadmap, state, and architecture artifacts.
- `docs/` — UX docs (wireframes, testing checklist).
- `public/` — static assets and PWA files.
- `src/` — application source.

## Source Layout (`src/`)

- `components/` — UI-only React components.
    - `reader/` — reader-focused presentation components.
- `hooks/` — orchestration hooks that bridge UI with runtime/engine APIs.
- `lib/` — business logic and system services.
    - `ai/` — provider orchestration, streaming, rate limiting, and caching.
    - `engine/` — cinematification pipeline and deterministic text systems.
        - `cinematifier/` — chapter engine, full-system pipeline, paragraph breakers, scene/narrative analysis.
    - `processing/` — extraction and resumable async processing workflows.
    - `runtime/` — reader/runtime services (renderer, telemetry, discovery APIs, metadata APIs).
    - `security/` — crypto and migration-safe security utilities.
- `store/` — persisted Zustand state.
- `test/` — Vitest setup.
- `types/` — shared type definitions.

## Key Runtime + Engine Modules

- `src/lib/runtime/readerApis.ts` — lexical lookup + multi-source story discovery (novel/manga/manhwa/manhua).
- `src/lib/runtime/readerBackend.ts` — telemetry snapshots and reader cinematic depth analytics.
- `src/lib/engine/cinematifier/paragraphBreakers.ts` — deterministic paragraph-breaker APIs.
- `src/lib/engine/cinematifier/fullSystemPipeline.ts` — canonical orchestration from rebuilt text to render plan.

---

_Structure audit: 2026-04-13_

---

## Documentation Map Reference

- Master repository map: `/home/runner/work/InfinityCN/InfinityCN/README.md`
- Planning overview: `/home/runner/work/InfinityCN/InfinityCN/.planning/PROJECT.md`, `/home/runner/work/InfinityCN/InfinityCN/.planning/ROADMAP.md`, `/home/runner/work/InfinityCN/InfinityCN/.planning/STATE.md`
- Codebase map set: `/home/runner/work/InfinityCN/InfinityCN/.planning/codebase/STRUCTURE.md`, `/home/runner/work/InfinityCN/InfinityCN/.planning/codebase/ARCHITECTURE.md`, `/home/runner/work/InfinityCN/InfinityCN/.planning/codebase/INTEGRATIONS.md`
