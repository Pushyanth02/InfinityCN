# Testing Patterns

**Analysis Date:** 2026-05-03

## Test Framework

**Runner:**
- Vitest 4.1.4
- Config: `vite.config.ts`

**Assertion Library:**
- `expect` global enhanced using `@testing-library/jest-dom/matchers`
- Configured in `src/test/setup.ts`

**Run Commands:**
```bash
npm run test              # Run tests inline
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage
```

## Test File Organization

**Location:**
- Co-located in nested `__tests__` directories (e.g. `src/components/__tests__/`)

**Naming:**
- Matches parent name: `[SourceFile].test.tsx` or `[SourceFile].test.ts`

## Test Environment

- Runs using `jsdom`.
- Global Window/DOM elements are mocked actively in `src/test/setup.ts` (e.g. `matchMedia`).

## Assertion Pattern

- React views verified with `@testing-library/react` wrappers.
- State checks performed directly.

---

*Testing analysis: 2026-05-03*
