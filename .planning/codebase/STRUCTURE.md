# Codebase Structure

**Analysis Date:** 2026-05-03

## Directory Layout

```
[]/
├── src/                # Root Source Logic
│   ├── components/     # Reusable and Core React Components (ui, reader, etc.)
│   ├── css/            # Global Styling Logic
│   ├── features/       # Grouped domain logics (e.g. settings UI / behavior)
│   ├── hooks/          # React Custom Hooks
│   ├── lib/            # Independent Pure Code Modules (AI, Engine, Processing, Export)
│   ├── store/          # Zustand State modules
│   ├── test/           # Test initializations and Utilities
│   └── types/          # Global TS typings
├── app/                # Root Layout abstractions (if defined as custom paths via compiler)
└── docs/               # Platform/project documentation context
```

## Directory Purposes

**src/lib/:**
- Purpose: Pure functional programming / core system abstractions decoupled from UI.
- Contains: Extractors, AI bridges, pipeline streaming code.
- Key files: `src/lib/processing/pdfWorker.ts`, `src/lib/rendering/renderBridge.ts`, `src/lib/runtime/appwrite.ts`.

**src/components/ & src/features/:**
- Purpose: Visual application and business interfaces.
- Contains: TSX component files.

**src/store/:**
- Purpose: Application State Handlers.
- Key files: Zustand store index definitions.

## Key File Locations

**Entry Points:**
- `src/main.tsx`: Web DOM App registration.

**Configuration:**
- `vite.config.ts`: Modifies bundler chunks and PWA mappings.
- `eslint.config.js`: Defines static analysis rules.

## Naming Conventions

**Files:**
- PascalCase: `CinematifierApp.tsx` (React Components)
- camelCase: `streamController.ts`, `pdfWorker.ts`, `requestPipeline.ts` (Logic, Scripts)

**Directories:**
- kebab-case/lowercase structure standard.

## Where to Add New Code

**New Feature (Visual / Form Logic):**
- Primary code: `src/features/[feature]/`
- Tests: `src/features/[feature]/__tests__/`

**New Internal Module / Pipeline Process:**
- Implementation: `src/lib/[module]/[file].ts`
- Tests: `src/lib/[module]/__tests__/`

## Special Directories

**__tests__:**
- Purpose: Co-located suite implementations verifying bounded domains.
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-05-03*
