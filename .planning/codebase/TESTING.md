# Testing Strategy

**Analysis Date:** 2026-03-25

## Tools & Configuration

- **Test Runner:** Vitest
- **Environment:** `jsdom` (simulates browser environment)
- **Assertion Library:** Vitest (Expect) with `@testing-library/jest-dom` matchers.
- **Setup:** `src/test/setup.ts` (Global mocks for `matchMedia`, etc.)

## Test Structure

Tests are co-located within feature directories in `__tests__` folders:
- `src/components/__tests__/*.test.tsx` — Component rendering and user interaction.
- `src/lib/__tests__/*.test.ts` — Engine logic, pipeline, AI routing.
- `src/store/__tests__/*.test.ts` — Global state transitions.

## Key Test Categories

### 1. Engine Logic (Critical)
- **Pipeline:** Verifies the sequential flow from raw text to cinematified blocks.
- **AI Engine:** Mocks AI responses and validates JSON parsing.
- **Segmentation:** Correctness of chapter and scene splitting.

### 2. UI/UX
- **Reader Rendering:** Ensures cinematic blocks (beats, SFX, transitions) display correctly.
- **Upload Flow:** Mocks file drops and ensures the processing overlay appears.

### 3. Persistence
- **IndexedDB:** Validates Dexie store/load operations (using `indexeddb-fast-mock` if necessary, or `jsdom`).

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# UI test runner
npx vitest --ui
```

---
*Testing audit: 2026-03-25*
