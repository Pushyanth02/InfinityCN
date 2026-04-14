# InfinityCN

**Version 15.0.0** | An AI-enhanced, offline-first reader that transforms novels into cinematic, immersive reading experiences. Upload PDF, EPUB, DOCX, PPTX, or TXT files and the app cinematifies them with SFX annotations, dramatic beats, scene transitions, and mood-based styling.

## Features

### Core Cinematification

- **AI-Powered Transformation** — Converts text into screenplay-style content with SFX: annotations, BEAT/PAUSE markers, and CUT TO/FADE IN transitions
- **Emotion & Tension Tracking** — Real-time emotion detection (joy, fear, sadness, suspense, anger, surprise) with tension scores (0-100)
- **Semantic Context** — Uses embeddings (all-MiniLM-L6-v2) for long-range context continuity across chapters
- **Ambient Audio** — Procedural Web Audio API soundscapes that adapt to story emotion

### Document Support

- **Multi-Format** — PDF, EPUB, DOCX, PPTX, TXT (up to 50MB)
- **OCR Support** — Tesseract.js-powered character recognition for scanned PDFs (up to 5 pages)
- **Smart Parsing** — Automatic chapter segmentation with paragraph reconstruction
- **Lazy Loading** — Heavy dependencies (pdfjs, fflate, tesseract) load only when needed

### Text Processing & Analysis (Free, No API Keys Required)

- **Readability Analysis** — Flesch-Kincaid Reading Ease/Grade Level, sentence complexity, vocabulary diversity
- **Sentiment Tracking** — AFINN-inspired lexicon (~200+ words) with negation/intensifier handling and emotion flow
- **Pacing Analysis** — Tension arc computation, flat/rushed zone detection, Shannon entropy for variety scoring
- **Text Statistics** — Word/character/sentence/paragraph counting, reading time estimation, top word frequency analysis
- **Scene Detection** — Heuristic scene break detection via location/character/time changes
- **Paragraph Breaker APIs** — Strategy-based paragraph splitting (sentence-cluster, dialogue-pivot, scene-cue) with canonical content-preservation guards
- **Book Metadata Enrichment** — Multi-source lookup (Open Library, Google Books, Gutendex, Wikipedia)
- **Inspirational Quotes** — Free API quotes with deterministic offline fallback

### Reader Experience

- **Dual-Mode** — Toggle between Original and Cinematified text
- **Immersion Levels** — Minimal (instant), Balanced, Cinematic (full animations)
- **Accessibility** — Dyslexia-friendly font option, adjustable font size and line spacing
- **Dark/Light Mode** — System-aware with manual toggle
- **Bookmarks & Progress** — Track reading progress, bookmark chapters
- **Expanded Story Discovery** — Related-title recommendations across novels, manga, manhwa, and manhua with source/type badges and sidebar filters
- **Cinematic Depth Metrics** — Live scene/cue/tension/mood stats derived from chapter render plans

### AI Providers

- **7 Providers** — Gemini 2.5 Flash, OpenAI GPT-4o-mini, Claude 3.5 Sonnet, Groq Llama 3.3 70B, DeepSeek, Ollama (local), Chrome AI (Gemini Nano)
- **Offline Fallback** — Fast algorithmic processing when no AI configured
- **Streaming** — Real-time cinematification with block-by-block streaming

### Technical

- **Offline-First** — IndexedDB via Dexie + PWA service worker
- **Composable Pipeline** — Modular stage-based processing (cleaning → reconstruction → analysis → cinematification → enrichment)
- **Responsive** — 480px mobile to 1200px+ desktop

## Tech Stack

| Layer      | Stack                                   |
| ---------- | --------------------------------------- |
| Framework  | React 19 + TypeScript 6                 |
| Build      | Vite 8 (Rolldown) + vite-plugin-pwa     |
| State      | Zustand (persisted)                     |
| Storage    | Dexie (IndexedDB)                       |
| Animation  | Framer Motion                           |
| Icons      | Lucide React                            |
| PDF        | pdfjs-dist                              |
| OCR        | Tesseract.js                            |
| Embeddings | @xenova/transformers (all-MiniLM-L6-v2) |
| Testing    | Vitest + Testing Library                |
| Linting    | ESLint + Prettier                       |
| Hooks      | Husky + lint-staged                     |
| CI/CD      | GitHub Actions                          |

## Free APIs & Algorithms

The app integrates the following free APIs and algorithms that require **no API keys**:

| Feature                     | Implementation                                                 | Source                                                      |
| --------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| PDF Text Extraction         | pdfjs-dist (Mozilla PDF.js)                                    | Bundled (lazy-loaded)                                       |
| EPUB/DOCX/PPTX Extraction   | fflate + XML parsing                                           | Bundled (lazy-loaded)                                       |
| Character Recognition (OCR) | Tesseract.js (WASM)                                            | Bundled (lazy-loaded)                                       |
| Semantic Embeddings         | all-MiniLM-L6-v2 via ONNX.js                                   | Bundled (lazy-loaded)                                       |
| Readability Scoring         | Flesch-Kincaid formulas                                        | Built-in algorithm                                          |
| Sentiment Analysis          | AFINN-inspired lexicon                                         | Built-in algorithm                                          |
| Pacing Analysis             | Tension arc + Shannon entropy                                  | Built-in algorithm                                          |
| Text Statistics             | Word/sentence/paragraph metrics                                | Built-in algorithm                                          |
| Scene Detection             | Location/time/structure heuristics                             | Built-in algorithm                                          |
| Paragraph Breaker APIs      | Multi-strategy paragraph segmentation with confidence scoring  | Built-in algorithm                                          |
| Book Metadata Enrichment    | Title/author/description enrichment                            | Open Library + Google Books + Gutendex + Wikipedia APIs     |
| Reader Story Discovery      | Related title recommendations across novel/manga/manhwa/manhua | Open Library + Google Books + Gutendex + Jikan + Kitsu APIs |
| Inspirational Quotes        | Multi-source quote retrieval + offline fallback                | DummyJSON Quotes API + Quotable API + built-in collection   |

## Core Engine Enhancements

- Scene-to-scene transition tagging (`[TRANSITION: ...]`) with tension-aware selection
- Camera cue generation (`[CAMERA: ...]`) based on tension, dialogue ratio, and readability
- Ambient sound bed hinting (`[AMBIENCE: ...]`) inferred from scene context
- Expanded scene analysis metrics: dialogue ratio and emotional charge
- Paragraph reconstruction supports sentence-cluster, dialogue-pivot, and scene-cue strategies with canonical-content fallback checks
- Reader analytics exposes cinematic depth metrics (scene count, cue count, average tension, dominant mood)

## Getting Started

### Prerequisites

- Node.js `^20.19.0 || >=22.12.0` (see `.nvmrc` — use `nvm use` to switch automatically)
- npm 8+

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## Scripts

| Command                 | Description                         |
| ----------------------- | ----------------------------------- |
| `npm run dev`           | Start Vite dev server               |
| `npm run build`         | Type-check and build for production |
| `npm run lint`          | Run ESLint                          |
| `npm run format`        | Format code with Prettier           |
| `npm run format:check`  | Check formatting without writing    |
| `npm test`              | Run test suite                      |
| `npm run test:watch`    | Run tests in watch mode             |
| `npm run test:coverage` | Run tests with coverage             |
| `npm run preview`       | Preview production build            |

## Project Structure

```
src/
  components/
    CinematifierApp.tsx      # Main app: upload → process → read flow
    CinematicReader.tsx      # Dual-mode reader with ambient audio
    CinematifierSettings.tsx # AI provider configuration
    ProcessingOverlay.tsx    # Processing status with inspirational quotes
    UploadZone.tsx           # Drag-and-drop file upload component
    reader/
      ChapterNav.tsx         # Chapter navigation sidebar
      CinematicBlockView.tsx # Cinematic block renderer
      EmotionHeatmap.tsx     # Emotion intensity heatmap
      OriginalTextView.tsx   # Original text display
      ReaderFooter.tsx       # Reader footer with progress
      ReaderHeader.tsx       # Reader header with mode toggle
      ReaderSettingsPanel.tsx # Font, spacing, immersion settings
      index.ts               # Reader barrel export
    ui/
      ErrorBoundary.tsx      # React error boundary
    __tests__/
      CinematifierApp.test.tsx  # Component tests
  lib/
    ai/
      cache.ts               # AI response caching
      errors.ts              # AI error types
      index.ts               # AI module barrel export
      presets.ts             # Model presets per provider
      providers.ts           # AI provider implementations
      streaming.ts           # Streaming response handling
      types.ts               # AI type definitions
    engine/
      cinematifier/
        chapterEngine.ts      # Canonical stage-ordered chapter pipeline
        fullSystemPipeline.ts # Full text -> cinematic orchestration
        paragraphBreakers.ts  # Paragraph-breaker API strategies
        pipeline.ts           # Stage definitions and execution engine
        textProcessing.ts     # Text cleaning + paragraph reconstruction
    processing/
      bookAsyncProcessor.ts   # Chunked async processing for large books
      pdfJobs.ts              # Resumable processing job tracking
      pdfWorker.ts            # Multi-format extraction + OCR
    runtime/
      appwrite.ts             # Appwrite client wiring
      bookManager.ts          # Local-first library manager
      freeApis.ts             # Free metadata enrichment APIs
      quotableApi.ts          # Quote APIs with offline fallback
      readerApis.ts           # Reader lexical + story discovery APIs
      readerBackend.ts        # Reader telemetry + cinematic depth analytics
      renderer.ts             # Runtime cue and scene planning
    audioSynth.ts             # Procedural ambient audio (Web Audio API)
    cinematifier.ts           # Engine facade export
    cinematifierDb.ts         # IndexedDB persistence (Dexie)
    crypto.ts                 # AES-GCM key encryption (SubtleCrypto)
    embeddings.ts             # Semantic embeddings (all-MiniLM-L6-v2)
    rateLimiter.ts            # Client-side rate limiting
    textStatistics.ts         # Text statistics & metrics API
  hooks/
    useChapterProcessing.ts   # Per-chapter processing + cancellation
    useFileProcessing.ts      # Upload/extract/segment/process orchestration
    useReaderAnalytics.ts     # Reader telemetry snapshot lifecycle
    useReaderDiscovery.ts     # Word lens + story discovery integration
  store/
    cinematifierStore.ts     # Zustand state with encrypted persistence
  types/
    cinematifier.ts          # TypeScript type definitions
  test/
    setup.ts                 # Vitest setup
  main.tsx                   # Entry point
  index.css                  # Global CSS reset & variables
  styles.css                 # App-level styles
  cinematifier.css           # Reader-specific styles
```

## License

Private.
