# System Architecture: InfinityCN

## Cinematifier Engine Flow

**Analysis Date:** 2026-04-13
**Pattern:** Input -> Pipeline -> Structured Data -> Runtime -> UI

---

## 1. Input Layer

The system accepts PDF/EPUB/DOCX/PPTX/TXT and extracts normalized text.

- `src/lib/processing/pdfWorker.ts` handles extraction and OCR fallback.
- `src/lib/processing/bookAsyncProcessor.ts` handles chunked processing for long documents.

## 2. Canonical Processing Pipeline

The chapter pipeline order is strict and must not be bypassed:

1. **Text Input**
2. **Paragraph Rebuilder**
3. **Scene Segmentation**
4. **Narrative Analysis**
5. **Cinematization**
6. **Renderer**

Implementation anchors:

- `src/lib/engine/cinematifier/chapterEngine.ts`
- `src/lib/engine/cinematifier/fullSystemPipeline.ts`
- `src/lib/engine/cinematifier/pipeline.ts`

## 3. Structured Output Layer

Pipeline output is normalized into typed entities:

- Cinematic blocks
- Scene groups
- Narrative metadata
- Render plan cues/scenes
- Stage trace timing

Primary types live in `src/types/cinematifier.ts`.

## 4. Runtime Layer

Runtime modules expose app-facing service APIs:

- `src/lib/runtime/renderer.ts` for render-plan building.
- `src/lib/runtime/readerBackend.ts` for telemetry and cinematic depth analytics.
- `src/lib/runtime/readerApis.ts` for lexical and story discovery APIs.

## 5. UI Layer

React components remain presentation-first:

- Components render state and callbacks only.
- Hooks orchestrate runtime/engine interactions.
- Business logic remains outside component files.

---

_Architecture audit: 2026-04-13_
