# Coding Conventions: InfinityCN

## Development & Quality Standards

**Analysis Date:** 2026-03-30
**Standard:** TypeScript Strict & Clean Code

---

## 🏛️ General Principles

- **Narrative First:** All code must improve pacing, emotional flow, or immersion.
- **Cinematifier Core:** Follow the `Input -> Pipeline -> Structured Data -> Runtime -> UI` flow.
- **Systems > Features:** Build reusable, modular systems.
- **Clean Code:** Remove unused code, dead functions, and duplicate logic. Prefer clarity over cleverness.

## ⌨️ TypeScript Styling

- **Strict Mode:** No `any`. Explicit types required for all function signatures and complex objects.
- **Zustand Stores:** Explicit interface definitions for all store state and actions.
- **Interfaces over Types:** Use `interface` for object definitions, `type` for unions/aliases.

## 📁 Naming Conventions

- **PascalCase:** React components and TypeScript interfaces/classes.
- **camelCase:** Hooks (`useAmbientAudio.ts`), variables, functions, and utility files.
- **SCREAMING_SNAKE_CASE:** Global constants and environment variables.

## 🎨 UI & UX Standards

- **Typography:** Target `~720px` max width for text containers to ensure readability.
- **Styles:** Vanilla CSS or CSS Modules with `cine-` prefix.
- **Animations:** Fluid, subtle transitions via `framer-motion`.

## 🧪 Testing Standards

- **Frontend:** Vitest for logical units and component behavior in `src/`.
- **Verification:** Mandatory checks for valid/invalid/large inputs and failure scenarios.

## ⚙️ Git Workflow

- **GSD Protocol:** Follow `PLAN -> BUILD -> VERIFY -> CLEAN -> SHIP`.
- **Atomic Commits:** Small, focused meaningful commits.
- **Pre-commit Hooks:** Automatic linting and formatting via Husky.

---

_Conventions audit: 2026-03-30_

---

## Documentation Map Reference

- Master repository map: `/home/runner/work/InfinityCN/InfinityCN/README.md`
- Planning overview: `/home/runner/work/InfinityCN/InfinityCN/.planning/PROJECT.md`, `/home/runner/work/InfinityCN/InfinityCN/.planning/ROADMAP.md`, `/home/runner/work/InfinityCN/InfinityCN/.planning/STATE.md`
- Codebase map set: `/home/runner/work/InfinityCN/InfinityCN/.planning/codebase/STRUCTURE.md`, `/home/runner/work/InfinityCN/InfinityCN/.planning/codebase/ARCHITECTURE.md`, `/home/runner/work/InfinityCN/InfinityCN/.planning/codebase/INTEGRATIONS.md`
