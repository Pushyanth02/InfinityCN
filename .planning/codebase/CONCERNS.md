# Codebase Concerns

**Analysis Date:** 2026-05-03

## Tech Debt

**Core Components Handling Heavy Lifting:**
- Issue: Substantial single-file complexity for system pipelines.
- Files: `src/lib/cinematifier/requestPipeline.ts` (33k chars), `src/lib/rendering/renderBridge.ts` (31k chars), `src/lib/engine/streamController.ts`
- Impact: Difficulty tracing end-to-end execution paths, prone to module entanglement.
- Fix approach: Evaluate breaking generic stream processing into smaller isolated node execution files.

## Performance Bottlenecks

**On-Device Models:**
- Problem: AI operations parsing text streams (`@xenova/transformers`, `tesseract.js`) create CPU boundaries.
- Cause: `pdfWorker.ts` offloads some, but heavy React rendering overhead via `requestPipeline` might still drop frames if WebWorkers are not fully isolating processing cycles.
- Improvement path: Review Web Worker boundaries ensuring 0% Main Thread processing for chunk inference.

## Security Considerations

**Offline vs Appwrite:**
- Files: `src/lib/runtime/appwrite.ts`
- Current mitigation: Initial ping logic validation.
- Recommendations: Ensure database credentials do not bypass user-level scoping in open Appwrite bucket operations.

---

*Concerns audit: 2026-05-03*
