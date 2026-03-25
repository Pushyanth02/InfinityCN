# Architecture Overview

**Analysis Date:** 2026-03-25

## System Design

InfinityCN is an offline-first, cinematic storytelling engine. It transforms raw text (novels) into a screenplay-like experience with SFX, transitions, and narrative beats using AI.

### Core Architectural Layers

1.  **UI/UX Layer (React 19):**
    - Entry Point: `CinematifierApp.tsx`
    - Logic: Custom hooks (`useFileProcessing`, `useBookHydration`, `useAmbientAudio`)
    - Animation: Framer Motion for cinematic transitions.
    - Componentization: Atomic UI components in `src/components/ui/` and feature-specific components (`CinematicReader`, `UploadZone`).

2.  **Cinematification Engine (Core):**
    - Orchestrator: `src/lib/cinematifier/pipeline.ts`
    - Stages: Parsing (`parser.ts`) -> Segmentation (`chapterSegmentation.ts`) -> Analysis (`sentimentTracker.ts`, `pacingAnalyzer.ts`) -> Transformation (`aiEngine.ts` or `offlineEngine.ts`).
    - Local ML: `@xenova/transformers` for semantic analysis and offline fallback.

3.  **Persistence Layer (IndexedDB):**
    - Tech: Dexie (`src/lib/cinematifierDb.ts`).
    - Structure: `books` table stores the full cinematified JSON; `readingProgress` tracks current chapter/block.
    - Purpose: Zero-latency reading and offline availability.

4.  **Global State (Zustand):**
    - Store: `src/store/cinematifierStore.ts`.
    - Function: Transient UI state, processing progress, and current book hydration.

5.  **Backend Services (Node/Express):**
    - API Server: `server/src/index.ts`.
    - AI Proxy: Securely caches AI calls using Redis.
    - Job Manager: For large books, queues chapter processing in RabbitMQ.
    - Workers: `server/src/worker.ts` consumes jobs, performs AI cinematification, and updates Redis.

## Data Flow

### 1. Book Upload & Processing
- User drops file -> `useFileProcessing` hook -> `parser.ts` extracts text.
- Small Book (< 100k words): Client orchestrates `pipeline.ts` with direct AI calls or local ML.
- Large Book: Client uploads metadata -> Server queues chapters in RabbitMQ -> Workers process via AI -> Client polls SSE `/api/jobs/:id/events`.

### 2. Reading Experience
- Book loaded from IndexedDB -> `CinematicReader.tsx` renders blocks sequentially.
- `useAmbientAudio`: Triggers SFX based on block metadata (`sfx: "thunder_distant"`).
- `useAutoScroll`: Maintains narrative pacing by dynamically adjusting scroll speed based on reading speed and "tension" markers.

## Key Design Patterns

- **Pipeline Pattern:** Sequential transformation stages with clearly defined input/output interfaces.
- **Provider Pattern:** AI calls abstract through `callAI` router supporting multiple cloud/local models.
- **Offline-First:** IndexedDB is the source of truth for the reader; the server/AI is a processing enhancement.

---
*Architecture mapping: 2026-03-25*
