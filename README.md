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
- **Dictionary Lookup** — On-demand word definitions via the free Dictionary API (dictionaryapi.dev, no key required)
- **Inspirational Quotes** — Curated literary quotes with Quotable API integration and offline fallback

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
- **Backend Server** — Optional Express server with Redis caching, RabbitMQ job queue, and per-IP rate limiting

## Tech Stack

| Layer | Stack |
|-------|-------|
| Framework | React 19 + TypeScript 5.9 |
| Build | Vite 7 + vite-plugin-pwa |
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
| Server | Express 5 + Redis + RabbitMQ |

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
| Word Definitions | Free Dictionary API | [dictionaryapi.dev](https://dictionaryapi.dev/) |
| Inspirational Quotes | Quotable API + offline fallback | [quotable](https://github.com/lukePeavey/quotable) |

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

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_API_PROXY_URL` | Backend server URL for server-side API keys | No |

AI API keys are configured at runtime through the in-app AI Settings panel and stored encrypted (AES-GCM) in browser localStorage. For production deployments with shared keys, use the optional backend server (see below).

## Backend Server (Recommended for Production)

The backend server (`server/src/index.ts`) provides:

- **Centralized API key management** — Store keys server-side, not in browser
- **Redis caching** — Cache AI responses for 30 minutes (configurable) to reduce API costs
- **Job queuing** — RabbitMQ-based async cinematification for large books
- **Per-IP rate limiting** — Sliding window, 30 req/min by default (Redis-backed)
- **Security** — API keys never exposed to client

### Quick Start (Docker)

```bash
# Start Redis, RabbitMQ, API server, and 2 workers
docker compose up

# Scale workers for throughput
docker compose up --scale worker=4
```

### Manual Start

```bash
# Install server dependencies
cd server && npm install

# Start the API server
npm run dev

# Start a worker (separate terminal)
npm run dev:worker
```

### Configure the frontend

```bash
# In your .env
VITE_API_PROXY_URL=http://localhost:3001
```

### Server Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API server port | `3001` |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | `http://localhost:5173` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `RABBITMQ_URL` | RabbitMQ connection URL | `amqp://infinitycn:infinitycn_dev@localhost:5672` |
| `GEMINI_API_KEY` | Google Gemini API key | — |
| `OPENAI_API_KEY` | OpenAI API key | — |
| `ANTHROPIC_API_KEY` | Anthropic API key | — |
| `GROQ_API_KEY` | Groq API key | — |
| `DEEPSEEK_API_KEY` | DeepSeek API key | — |
| `OLLAMA_URL` | Local Ollama server URL | `http://localhost:11434` |
| `CACHE_TTL_SECONDS` | AI response cache TTL | `1800` |
| `RATE_WINDOW_MS` | Rate limit window | `60000` |
| `RATE_MAX_REQUESTS` | Max AI proxy requests per window per IP | `30` |
| `JOBS_RATE_WINDOW_MS` | Job API rate-limit window | `60000` |
| `JOBS_RATE_MAX_REQUESTS` | Max job API requests per window per IP | `20` |
| `REQUIRE_JOB_TOKEN` | Require per-job access token for read/cancel/SSE routes | `true` |
| `MAX_TOKENS_CAP` | Output token cap (cost protection) | `2048` |
| `WORKER_CONCURRENCY` | Concurrent chapters per worker | `1` |

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /health` | GET | Health check — Redis, RabbitMQ, available providers |
| `POST /api/ai/:provider` | POST | Proxy AI request with caching |
| `POST /api/jobs` | POST | Submit book for server-side cinematification |
| `GET /api/jobs/:bookId` | GET | Get job status |
| `GET /api/jobs/:bookId/chapters/:index` | GET | Get processed chapter result |
| `DELETE /api/jobs/:bookId` | DELETE | Cancel a job |
| `GET /api/jobs/:bookId/events` | GET | SSE stream for real-time progress |

## Project Structure

```
src/
  components/
    CinematifierApp.tsx      # Main app: upload → process → read flow
    CinematicReader.tsx      # Dual-mode reader with ambient audio
    CinematifierSettings.tsx # AI provider configuration
    ProcessingOverlay.tsx    # Processing status with inspirational quotes
    ui/
      ErrorBoundary.tsx      # React error boundary
    __tests__/
      CinematifierApp.test.tsx  # Component tests
  lib/
    ai.ts                    # Multi-provider AI engine with streaming
    cinematifier.ts          # Text-to-cinematic transformation engine
    cinematifierDb.ts        # IndexedDB persistence (Dexie)
    crypto.ts                # AES-GCM key encryption (SubtleCrypto)
    dictionaryApi.ts         # Free Dictionary API client (word lookups)
    embeddings.ts            # Semantic embeddings (all-MiniLM-L6-v2)
    audioSynth.ts            # Procedural ambient audio (Web Audio API)
    pdfWorker.ts             # Multi-format document extraction + OCR
    quotableApi.ts           # Quotable API client with offline fallback
    serverJobs.ts            # Frontend client for the server job API
    textStatistics.ts        # Text statistics & metrics API
    cinematifier/
      textProcessing.ts      # Text cleaning & paragraph reconstruction
      chapterSegmentation.ts # Chapter boundary detection
      sceneDetection.ts      # Heuristic scene break detection
      parser.ts              # AI output → CinematicBlock[] parsing
      aiEngine.ts            # AI-powered cinematification orchestration
      offlineEngine.ts       # Offline/fallback cinematification
      entities.ts            # Book & ReadingProgress entity factories
      metadata.ts            # Narrative metadata extraction
      readability.ts         # Flesch-Kincaid readability analysis
      sentimentTracker.ts    # Lexicon-based sentiment/emotion tracking
      pacingAnalyzer.ts      # Pacing analysis & tension arcs
      pipeline.ts            # Composable pipeline engine
  store/
    cinematifierStore.ts     # Zustand state with encrypted persistence
  types/
    cinematifier.ts          # TypeScript type definitions
  test/
    setup.ts                 # Vitest setup
  main.tsx                   # Entry point
  styles.css                 # CSS entry point
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
      rateLimit.ts           # Redis sliding-window rate limiter
      errorHandler.ts        # Centralized Express error handler
    routes/
      ai.ts                  # AI proxy routes with Redis caching
      jobs.ts                # Job submission, status, SSE events
      health.ts              # Health check with service status
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
