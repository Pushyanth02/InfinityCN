---
focus: quality
mapped_at: 2026-07-17
last_mapped_commit: v0
---

# Testing

## Framework

- **Vitest 4** (`vitest.config.ts`) — `globals: true`, `environment: 'node'`.
- **Includes**: `src/**/*.test.ts`, `src/**/*.test.tsx`.
- **Excludes**: `node_modules`, `.next`, `build`.
- **testTimeout**: 10s.
- **Path alias** `@` → `./src` (mirrors `tsconfig.json`).

## Commands

```bash
bun run test               # vitest, single pass (script: `bun x vitest run`)
bun run test:watch         # vitest watch mode
bunx vitest run src/lib/nlp/core.test.ts           # one file
bunx vitest run -t "detects scene boundary"        # one test by name

# E2E (hits a real DB, writes transcript to e2e-report.txt):
bunx vitest run src/__e2e__/pipeline-e2e.test.ts
```

Typecheck (no dedicated script; tsconfig has `noEmit`):

```bash
bunx tsc --noEmit
```

## Test layout

Tests are **co-located** with source as `<module>.test.ts`:

```
src/lib/pipeline/
├── orchestrator.ts
├── extract.ts          ├── extract.test.ts
├── original.ts         ├── original.test.ts
├── cinematified.ts     ├── cinematified.test.ts
│                       ├── cinematified-v2.test.ts   # v2 intelligence harness
│                       ├── metadata.test.ts
│                       └── pdf-extract.test.ts
src/lib/nlp/
├── core.ts             ├── core.test.ts
└── …co-located *.test.ts per engine
```

Dedicated directories:

- `src/__tests__/` — unit/integration tests not co-located.
- `src/__tests__/security/` — **security tests**; must stay green when
  middleware or upload handling changes.
- `src/__e2e__/pipeline-e2e.test.ts` — end-to-end pipeline test requiring a
  live SQLite DB. Writes `e2e-report.txt`.
- `src/__fixtures__/` — shared test fixtures.

## Coverage

Configured in `vitest.config.ts` (v8 provider):

- **Includes** `src/lib/**/*.ts`.
- **Excludes** test files and `node_modules`.
- **Thresholds**: lines 60%, functions 60%, branches 50%, statements 60%.
- Reporters: `text`, `lcov`.

## What's tested

- **NLP engines** — co-located tests per engine (`characters`, `emotion`,
  `scenes`, `relationships`, `structure`, `momentum`, `core`). The place to
  look when changing detection behavior.
- **Pipeline stages** — `extract`, `original`, `cinematified`, `metadata`,
  `pdf-extract` each have unit tests.
- **v2 intelligence layer** — `cinematified-v2.test.ts` is the integration
  harness for `src/lib/intelligence/` (engine → registry →
  `NovelIntelligenceEngine`) and `src/lib/pipeline/metadata.ts`. Treat as
  active development, not final.
- **Security** — `src/__tests__/security/` covers middleware (API-key + CSRF
  origin, rate limiting, ID validation, body size) and upload validation
  (MIME + extension + magic bytes).

## CI

`.github/workflows/` runs lint + test + typecheck gates. Docker build,
CodeQL, and APIsec scanning workflows are also wired (recent commits show
active hardening of CodeQL findings).
