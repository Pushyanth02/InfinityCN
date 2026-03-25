# Coding Conventions

**Analysis Date:** 2026-03-25

## General Principles

- **Narrative First:** All code must improve pacing, emotional flow, or immersion.
- **Cinematifier Core:** Follow the `Input -> Pipeline -> Structured Data -> Runtime -> UI` flow.
- **TypeScript Strict:** No `any`, explicit types for all interfaces and functions.

## Naming Conventions

- **Components:** `PascalCase` (e.g., `CinematicReader.tsx`)
- **Hooks:** `camelCase` with `use` prefix (e.g., `useAmbientAudio.ts`)
- **Variables/Functions:** `camelCase`
- **Constants:** `SCREAMING_SNAKE_CASE` (e.g., `AI_JSON_TIMEOUT_MS`)
- **Files:** `camelCase` for utilities, `PascalCase` for React components.

## Styles & UI

- **CSS Modules:** Vanilla CSS with scoped classes (pref. `cine-` prefix).
- **Icons:** `lucide-react`
- **Animations:** `framer-motion` for all transitions.
- **Max Width:** Typography should target `~720px` for optimal readability.

## State Management

- **Zustand:** Used for global application state (`src/store/`).
- **Dexie:** Source of truth for persistent data (books, progress).
- **Persistence:** Book data must never reside only in memory; sync to IndexedDB immediately after processing.

## AI Interaction

- **Structured Output:** AI must return valid JSON (validated in `aiEngine.ts` or server worker).
- **Prompting:** Use system prompts to enforce formatting. Avoid markdown in AI output unless intended for final render.
- **Fallback:** Always provide an offline fallback (`offlineEngine.ts`) using local ML if the cloud provider fails.

## Git & Workflow

- **Atomic Commits:** Prefer small, focused commits.
- **Linting:** Pre-commit hooks (`husky`, `lint-staged`) enforce ESLint and Prettier rules.
- **Branches:** Feature-based branching.

---
*Conventions audit: 2026-03-25*
