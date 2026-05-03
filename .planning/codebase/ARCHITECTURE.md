# Architecture

**Analysis Date:** 2026-05-03

## Pattern Overview

**Overall:** Offline-First Modular SPA

**Key Characteristics:**
- Heavy client-side processing (PDF parsing, OCR, AI execution) utilizing dynamic chunked imports and Web Workers.
- Persistent local data combined with cloud sync (Appwrite, Dexie).
- Strict separation of core processing logic, external interaction, state management, and React UI components.

## Layers

**UI Components:**
- Location: `src/components` and `src/features`
- Contains: React TSX files (`CinematifierApp.tsx`, `ProcessingOverlay.tsx`).
- Depends on: Local custom hooks, Zustand stores.
- Used by: React rendering root.

**Store (State Management):**
- Location: `src/store`
- Contains: Zustand states configuring the application interface and pipeline processing states.
- Depends on: App types.

**Libraries / Core Logic:**
- Location: `src/lib` (`ai`, `cinematifier`, `engine`, `export`, `processing`, `rendering`, `runtime`, `security`)
- Contains: Core processing algorithms, request pipelines (`requestPipeline.ts`), and engine handling.
- Depends on: Heavy external data APIs (`pdfjs-dist`, `@xenova/transformers`, `tesseract.js`).

## Data Flow

**Cinematification Stream:**

1. Input provided from UI.
2. Routed to `src/lib/processing/textProcessingEngine.ts` to convert PDF/Doc logic to text.
3. Handled via `src/lib/engine/cinematifier` and `src/lib/ai/providers` orchestrating prompts or local embedding creation.
4. Output directed into `src/lib/rendering/renderBridge.ts` syncing with the React component layer.

**State Management:**
- Zustand handles unidirectional state propagation into React without props drilling.

## Key Abstractions

**Processing Engines:**
- Operations isolated into robust controllers (`streamController.ts`, `requestPipeline.ts`, `exportPipeline.ts`).
- Examples: `src/lib/processing/pdfWorker.ts`.
- Pattern: Worker process pattern / Adapter routing.

## Entry Points

**React Application Boot:**
- Location: `src/main.tsx`
- Responsibilities: Validates root element, checks Appwrite connectivity, and attaches performance insights lazy loading. Wraps in strict mode and top-level error boundaries.

## Error Handling

**Strategy:** Global Error Boundaries & Unhandled Promise interceptions.

**Patterns:**
- `<ErrorBoundary>` mapping across complete generic application space.
- Specific library faults and AI parsing errors are intercepted and pushed to metrics or console logging to avoid fatal loops.

---

*Architecture analysis: 2026-05-03*
