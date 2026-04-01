# System Architecture: InfinityCN
## The Cinematifier Engine Flow

**Analysis Date:** 2026-03-30
**Pattern:** Input → Pipeline → Structured Data → Runtime → UI

---

## 🏗️ 1. Input Layer
The system accepts raw story text (TXT, MD, PDF, OCR scan).
- **Parsers:** `src/lib/cinematifier/parser.ts` handles multiformat extraction.
- **Scanning:** `tesseract.js` for physical document intake.

## ⚙️ 2. Processing Pipeline
The heart of the engine, breaking the story into cinematic beats.
1. **Structural Scan:** Analyzes chapter markings.
2. **Scene Segmentation:** Identifies scene boundaries using `sceneDetection.ts`.
3. **Narrative Analysis:** Tracks entities using `entities.ts` and `metadata.ts`.
4. **Emotion + Tension Mapping:** Map emotional peaks and troughs via `sentimentTracker.ts`.
5. **Pacing Analysis:** Evaluates reading speed and flow via `pacingAnalyzer.ts`.

## 📦 3. Structured Data Output
All processing results in a strictly defined JSON structure.
- **Validation:** `src/lib/cinematifier/aiEngine.ts` ensures the AI output matches the schema.
- **Persistence:** Syncs to IndexedDB (Dexie) immediately, ensuring the data is available offline.

## 🎬 4. Runtime Rendering
The runtime engine transforms the structured JSON into an immersive experience.
- **Scene-Based Rendering:** Only the current, previous, and next scenes are rendered at any time for performance.
- **Dynamic Adjustments:** The runtime modifies typography and spacing based on the narrative tension.
- **Ambient Orchestration:** `useAmbientAudio.ts` syncs SFX and music to the narrative flow.

## 🎨 5. UI Layer
The "invisible" UI that keeps the focus entirely on the story.
- **Typography:** Optimized for readability with a max width of ~720px.
- **Transitions:** Fluid, framer-motion powered transitions between narrative beats.
- **Dark Mode:** A sleek, minimal design system using glassmorphism.

---

## 🏗️ Hybrid Service Architecture
- **API Gateway (Node.js):** Handles user sessions, lightweight jobs, and AI orchestration.
- **Core Engine (.NET):** Handles high-performance document serialization and legacy logic.
- **Message Bus (RabbitMQ):** Manages asynchronous cinematification jobs between Node and .NET workers.
- **State Sync (Redis):** Ensures real-time state consistency across distributed instances.

---
*Architecture audit: 2026-03-30*
