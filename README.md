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
- **Inspirational Quotes** — Curated literary quotes for display during processing (offline, no API required)

### Reader Experience
- **Dual-Mode** — Toggle between Original and Cinematified text
- **Immersion Levels** — Minimal (instant), Balanced, Cinematic (full animations)
- **Accessibility** — Dyslexia-friendly font option, adjustable font size and line spacing
- **Dark/Light Mode** — System-aware with manual toggle
- **Bookmarks & Progress** — Track reading progress, bookmark chapters

### AI Providers
- **7 Providers** — Gemini 2.5 Flash, OpenAI GPT-4o-mini, Claude 3.5 Sonnet, Groq Llama 3.3 70B, DeepSeek, Ollama (local), Chrome AI (Gemini Nano)
- **Offline Fallback** — Fast algorithmic processing when no AI configured
- **Streaming** — Real-time cinematification with block-by-block streaming
- **Encrypted Storage** — AES-GCM encrypted API keys in localStorage

### Technical
- **Offline-First** — IndexedDB via Dexie + PWA service worker
- **Composable Pipeline** — Modular stage-based processing (cleaning → reconstruction → analysis → cinematification → enrichment)
- **Responsive** — 480px mobile to 1200px+ desktop

## Tech Stack

| Layer | Stack |
|-------|-------|
| Framework | React 19 + TypeScript 5.9 |
| Build | Vite 8 (Rolldown) + vite-plugin-pwa |
| State | Zustand (persisted) |
| Storage | Dexie (IndexedDB) |
| Animation | Framer Motion |
| Icons | Lucide React |
| PDF | pdfjs-dist |
| OCR | Tesseract.js |
| Embeddings | @xenova/transformers (all-MiniLM-L6-v2) |
| Testing | Vitest + Testing Library |
| Linting | ESLint + Prettier |
| Hooks | Husky + lint-staged |
| CI/CD | GitHub Actions |

## Free APIs & Algorithms

The app integrates the following free APIs and algorithms that require **no API keys**:

| Feature | Implementation | Source |
|---------|---------------|--------|
| PDF Text Extraction | pdfjs-dist (Mozilla PDF.js) | Bundled (lazy-loaded) |
| EPUB/DOCX/PPTX Extraction | fflate + XML parsing | Bundled (lazy-loaded) |
| Character Recognition (OCR) | Tesseract.js (WASM) | Bundled (lazy-loaded) |
| Semantic Embeddings | all-MiniLM-L6-v2 via ONNX.js | Bundled (lazy-loaded) |
| Readability Scoring | Flesch-Kincaid formulas | Built-in algorithm |
| Sentiment Analysis | AFINN-inspired lexicon | Built-in algorithm |
| Pacing Analysis | Tension arc + Shannon entropy | Built-in algorithm |
| Text Statistics | Word/sentence/paragraph metrics | Built-in algorithm |
| Scene Detection | Location/time/structure heuristics | Built-in algorithm |
| Inspirational Quotes | Curated offline literary quotes | Built-in collection |

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

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check and build for production |
| `npm run lint` | Run ESLint |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check formatting without writing |
| `npm test` | Run test suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage |
| `npm run preview` | Preview production build |


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
    ai.ts                    # Multi-provider AI engine barrel
    ai/
      cache.ts               # AI response caching
      errors.ts              # AI error types
      index.ts               # AI module barrel export
      presets.ts             # Model presets per provider
      providers.ts           # AI provider implementations
      streaming.ts           # Streaming response handling
      types.ts               # AI type definitions
    audioSynth.ts            # Procedural ambient audio (Web Audio API)
    cinematifier.ts          # Text-to-cinematic transformation engine
    cinematifier/
      aiEngine.ts            # AI-powered cinematification orchestration
      chapterSegmentation.ts # Chapter boundary detection
      entities.ts            # Book & ReadingProgress entity factories
      index.ts               # Cinematifier barrel export
      metadata.ts            # Narrative metadata extraction
      offlineEngine.ts       # Offline/fallback cinematification
      pacingAnalyzer.ts      # Pacing analysis & tension arcs
      parser.ts              # AI output → CinematicBlock[] parsing
      pipeline.ts            # Composable pipeline engine
      readability.ts         # Flesch-Kincaid readability analysis
      sceneDetection.ts      # Heuristic scene break detection
      sentimentTracker.ts    # Lexicon-based sentiment/emotion tracking
      textProcessing.ts      # Text cleaning & paragraph reconstruction
    cinematifierDb.ts        # IndexedDB persistence (Dexie)
    constants.ts             # Shared constants
    crypto.ts                # AES-GCM key encryption (SubtleCrypto)
    embeddings.ts            # Semantic embeddings (all-MiniLM-L6-v2)
    pdfWorker.ts             # Multi-format document extraction + OCR
    quotableApi.ts           # Curated offline literary quotes
    rateLimiter.ts           # Client-side rate limiting
    serverJobs.ts            # Frontend client for the server job API
    textStatistics.ts        # Text statistics & metrics API
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
server/
  src/
    index.ts                 # Express API server entry point
    worker.ts                # RabbitMQ job consumer
    config.ts                # Centralized config from env vars
    types.ts                 # Server-side type definitions
    lib/
      cinematifier.ts        # Server-side cinematification engine
      hash.ts                # SHA-256 content hashing
    middleware/
      cors.ts                # CORS origin validation
      errorHandler.ts        # Centralized Express error handler
      rateLimit.ts           # Redis sliding-window rate limiter
      securityHeaders.ts     # Security headers (CSP, X-Content-Type-Options)
    routes/
      ai.ts                  # AI proxy routes with Redis caching
      health.ts              # Health check with service status
      jobs.ts                # Job submission, status, SSE events
    services/
      aiProvider.ts          # Server-side AI provider calls
      cache.ts               # Redis AI response cache
      jobManager.ts          # Job lifecycle state management
      rabbitmq.ts            # RabbitMQ connection and queue topology
      redis.ts               # Redis client singleton with Pub/Sub
  Dockerfile                 # Multi-stage build (api + worker targets)
  package.json
.github/
  workflows/ci.yml           # GitHub Actions CI pipeline (Node 22)
docker-compose.yml           # Full infrastructure stack
```

## License

Private.
