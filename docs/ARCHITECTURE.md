# InfinityCN Architecture Documentation

## Executive Summary

InfinityCN is an AI-enhanced, offline-first reader that transforms novels into cinematic, immersive reading experiences. Built with React 19 and TypeScript 5.9, it employs a modern, modular architecture with strong separation of concerns.

**Version:** 15.0.0
**Last Updated:** March 2026

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (Browser)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │   React 19 UI    │  │   Zustand Store  │  │    IndexedDB (Dexie)     │  │
│  │   Components     │◄─┤  Encrypted Persist│◄─┤  Books + Chapters       │  │
│  │   (Lazy-loaded)  │  │  (localStorage)  │  │  Settings/Progress       │  │
│  └────────┬─────────┘  └────────┬─────────┘  └──────────────────────────┘  │
│           │                     │                                           │
│           ▼                     ▼                                           │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      Core Processing Engine                          │  │
│  │  ┌─────────────┐  ┌──────────────────┐  ┌─────────────────────────┐  │  │
│  │  │ pdfWorker   │  │ cinematifier.ts  │  │      ai.ts              │  │  │
│  │  │ (PDF/EPUB/  │  │ (Cinematification│  │ (7 AI providers +       │  │  │
│  │  │  DOCX/PPTX/ │  │  Engine + Segment│  │  streaming + dedup +    │  │  │
│  │  │  TXT)       │  │  ation + Parsing)│  │  LRU cache + retry)     │  │  │
│  │  └─────────────┘  └──────────────────┘  └─────────────────────────┘  │  │
│  │  ┌─────────────┐  ┌──────────────────┐  ┌─────────────────────────┐  │  │
│  │  │ embeddings  │  │  audioSynth      │  │  serverJobs.ts          │  │  │
│  │  │ (MiniLM-L6) │  │  (Web Audio API) │  │  (SSE + polling client) │  │  │
│  │  └─────────────┘  └──────────────────┘  └─────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                          │
         ┌────────────────────────────────┼─────────────────────────────────┐
         │             EXTERNAL SERVICES  │                                  │
         │  ┌─────────────────────────────▼──────────────────────────────┐  │
         │  │             AI Providers (7 supported)                      │  │
         │  │  Gemini 2.5 Flash · GPT-4o-mini · Claude 3.5 Sonnet        │  │
         │  │  Groq Llama 3.3 · DeepSeek · Ollama · Chrome AI Nano       │  │
         │  └────────────────────────────────────────────────────────────┘  │
         │                                                                   │
         │  ┌────────────────────────────────────────────────────────────┐  │
         │  │          Optional Backend Server (server/src/)              │  │
         │  │  Express 5 · Redis · RabbitMQ · Per-IP Rate Limiting        │  │
         │  │  AI proxy /api/ai/:provider  (cached)                       │  │
         │  │  Job API  /api/jobs          (async cinematification)       │  │
         │  └────────────────────────────────────────────────────────────┘  │
         └───────────────────────────────────────────────────────────────────┘
```

---

## Layer Architecture

### 1. Presentation Layer (`src/components/`)

| Component | Responsibility | Loading Strategy |
|-----------|---------------|------------------|
| `CinematifierApp.tsx` | Root flow: upload → process → read | Eager |
| `CinematicReader.tsx` | Dual-mode reader, ambient audio, bookmarks | Lazy |
| `CinematifierSettings.tsx` | AI provider configuration modal | Lazy |
| `ErrorBoundary.tsx` | React error boundary wrapper | Eager |

**Design Decisions:**
- Heavy components (`CinematicReader`, `CinematifierSettings`) are lazy-loaded to reduce the initial bundle
- Framer Motion handles all animations for consistent 60fps performance
- Lucide React provides tree-shakeable icons

### 2. State Management Layer (`src/store/cinematifferStore.ts`)

**Pattern:** Zustand with `persist` middleware + async AES-GCM encryption

```typescript
// Persisted to localStorage (API keys encrypted)
{
  readerMode: 'cinematified' | 'original' | 'side-by-side',
  fontSize: number,
  lineSpacing: number,
  immersionLevel: 'minimal' | 'balanced' | 'cinematic',
  dyslexiaFont: boolean,
  darkMode: boolean,
  aiProvider: 'none' | 'chrome' | 'gemini' | 'openai' | 'anthropic' | 'groq' | 'deepseek' | 'ollama',
  geminiKey: string,        // AES-GCM encrypted at rest
  openAiKey: string,        // AES-GCM encrypted at rest
  anthropicKey: string,     // AES-GCM encrypted at rest
  groqKey: string,          // AES-GCM encrypted at rest
  deepseekKey: string,      // AES-GCM encrypted at rest
  ollamaUrl: string,
  ollamaModel: string,
  useSearchGrounding: boolean,
}

// In-memory only (not persisted)
{
  book: Book | null,
  readingProgress: ReadingProgress | null,
  currentChapterIndex: number,
  isProcessing: boolean,
  processingProgress: ProcessingProgress | null,
  error: string | null,
}
```

**Key Features:**
- API keys are encrypted with AES-GCM (SubtleCrypto) before every `localStorage` write
- Async decryption on rehydration with automatic migration from legacy XOR obfuscation
- Atomic selectors prevent unnecessary re-renders

### 3. Business Logic Layer (`src/lib/`)

| Module | Purpose | Dependencies |
|--------|---------|--------------|
| `ai.ts` | Multi-provider AI client with streaming, dedup, LRU cache, retry | None (external APIs) |
| `cinematifier.ts` | Text-to-cinematic transformation, chapter segmentation, block parsing | `ai.ts`, `embeddings.ts` |
| `cinematifierDb.ts` | Dexie IndexedDB schema and operations | `dexie` |
| `crypto.ts` | AES-GCM key encryption via SubtleCrypto | None (Web Crypto API) |
| `embeddings.ts` | Semantic embeddings (all-MiniLM-L6-v2 via @xenova/transformers) | `@xenova/transformers` |
| `audioSynth.ts` | Procedural ambient audio via Web Audio API | None |
| `pdfWorker.ts` | Lazy multi-format extraction (PDF/EPUB/DOCX/PPTX/TXT) | `pdfjs-dist`, `fflate`, `tesseract.js` |
| `serverJobs.ts` | Frontend client for backend job API (SSE + polling fallback) | None |

**Critical Path:**
```
File Upload → pdfWorker.ts → cinematifier.ts (segmentChapters) → ai.ts → Store → UI
                                    ↓                    ↑
                              embeddings.ts (context)    cinematifyOffline (fallback)
```

### 4. Data Layer (`src/lib/cinematifierDb.ts`)

**Database:** Dexie (IndexedDB wrapper)

**Schema:**
```typescript
// books table
interface Book {
  id: string;
  title: string;
  author?: string;
  genre: BookGenre;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  totalChapters: number;
  processedChapters: number;
  totalWordCount: number;
  chapters: Chapter[];   // embedded — stored as serialized array
  createdAt: number;
  updatedAt: number;
}

// Chapter (part of Book.chapters)
interface Chapter {
  id: string;
  bookId: string;
  number: number;
  title: string;
  originalText: string;
  cinematifiedBlocks: CinematicBlock[];
  status: 'pending' | 'processing' | 'ready' | 'error';
  wordCount: number;
  estimatedReadTime: number;
  toneTags?: string[];
}
```

### 5. Optional Backend (`server/src/`)

**Purpose:** Server-side API key management, caching, and async job processing

**Components:**
- `index.ts` — Express 5 entry point, graceful shutdown
- `worker.ts` — RabbitMQ consumer for async cinematification
- `routes/ai.ts` — AI proxy with Redis response caching
- `routes/jobs.ts` — Job lifecycle: submit, status, chapter results, cancel, SSE events
- `routes/health.ts` — Redis + RabbitMQ + provider health check
- `middleware/rateLimit.ts` — Atomic Lua sliding-window rate limiter (Redis)
- `services/aiProvider.ts` — Direct AI provider calls with retry
- `services/cache.ts` — SHA-256 keyed Redis cache (30min TTL)
- `services/jobManager.ts` — Redis hash-based job state with Pub/Sub events
- `services/rabbitmq.ts` — amqplib with dead-letter queues and auto-reconnect

---

## Data Flow

### 1. Client-Side File Processing Pipeline

```
┌──────────┐    ┌──────────────┐    ┌─────────────────┐    ┌──────────────┐
│  Upload  │───►│ detectFormat │───►│  extractText    │───►│segmentChapters│
│  (Drop)  │    │ (50MB check) │    │ (PDF/EPUB/etc.) │    │ (NLP-based)  │
└──────────┘    └──────────────┘    └─────────────────┘    └──────┬───────┘
                                                                   │
                                              ┌────────────────────┘
                                              ▼
                                  ┌────────────────────┐    ┌──────────────┐
                                  │ cinematifyText     │───►│ Dexie (IDB)  │
                                  │ (chunk → AI call   │    │ persistence  │
                                  │  → block parsing   │    └──────────────┘
                                  │  → streaming UI)   │
                                  └────────────────────┘
```

### 2. AI Enhancement Flow (Client)

```
┌────────────┐    ┌──────────────────┐    ┌──────────────────────┐
│ Chunk text │───►│ Token Bucket     │───►│ Request Dedup        │
│ (3500 char)│    │ Rate Limiter     │    │ (In-flight Map)      │
└────────────┘    └──────────────────┘    └──────────┬───────────┘
                                                     │
                          ┌──────────────────────────┤
                          ▼                          ▼
               ┌────────────────────┐     ┌──────────────────────┐
               │ LRU Cache          │     │ AI Provider Call     │
               │ (30min TTL, 50 max)│     │ (stream if supported)│
               └────────────────────┘     └──────────────────────┘
                                                     │
                          ┌──────────────────────────┘
                          ▼
               ┌────────────────────┐     ┌──────────────────────┐
               │ parseCinematified  │───►│ Semantic Embedding   │
               │ Text (block parser)│     │ (for next chunk ctx) │
               └────────────────────┘     └──────────────────────┘
```

### 3. Server-Side Job Flow

```
POST /api/jobs
      │
      ▼
┌───────────────┐    ┌───────────────┐    ┌─────────────────────────────┐
│ Validate input│───►│ createJob     │───►│ publishJob (one msg/chapter)│
│ (chapters,    │    │ (Redis hash)  │    │ → cinematify-jobs queue     │
│  provider,    │    └───────────────┘    └─────────────────────────────┘
│  bookId)      │                                        │
└───────────────┘                                        ▼
                                              ┌─────────────────────────┐
                                              │ Worker consumes message │
                                              │ 1. Cancel check         │
                                              │ 2. Cache check (Redis)  │
                                              │ 3. callAIProvider       │
                                              │ 4. parseCinematified    │
                                              │ 5. storeChapterResult   │
                                              │ 6. publishJobEvent      │
                                              │    (Redis Pub/Sub)      │
                                              └─────────────────────────┘
                                                          │
GET /api/jobs/:id/events                                  │
      │ SSE (EventSource)                                 │
      └──────────────────────────────────────────────────►│
            Redis subscriber receives events
```

---

## Performance Optimizations

### Bundle Splitting Strategy

```javascript
// vite.config.ts manualChunks
{
  'pdfjs':        ['pdfjs-dist'],           // ~400KB, loaded on PDF drop
  'fflate':       ['fflate'],               // ~5KB, loaded on EPUB/DOCX/PPTX drop
  'tesseract':    ['tesseract.js'],         // ~16KB, loaded only for scanned PDFs
  'onnx':         ['onnxruntime-web'],      // ~558KB, shared ML runtime
  'transformers': ['@xenova/transformers'], // ~225KB, embeddings model
  'motion':       ['framer-motion'],        // ~123KB, animations
  'lucide':       ['lucide-react'],         // ~8KB, icons
  'dexie':        ['dexie'],                // ~95KB, IndexedDB
  'store':        ['zustand'],              // ~3KB, state
  'analytics':    ['@vercel/analytics', '@vercel/speed-insights'],
  'react':        ['react', 'react-dom']    // ~193KB, always needed
}
```

### Lazy Loading Triggers

| Resource | Loaded When | Bundle Impact |
|----------|-------------|--------------|
| `pdfjs-dist` | PDF file dropped | −400KB initial |
| `fflate` | EPUB/DOCX/PPTX dropped | −5KB initial |
| `tesseract.js` | Scanned PDF page detected | Deferred |
| `@xenova/transformers` | First AI cinematification | Deferred |
| `CinematicReader` | Book ready to read | −22KB initial |
| `CinematifierSettings` | Settings button clicked | −11KB initial |
| Analytics | After mount | −10KB initial |

### Client-Side AI Optimizations

1. **Request deduplication** — identical in-flight requests share one Promise
2. **LRU cache** — 50-entry cache with 30-minute TTL per provider
3. **Token bucket** — per-provider rate limiting to avoid 429 errors
4. **Exponential backoff retry** — classifies errors (rate_limit, auth, network, timeout)
5. **Streaming** — block-by-block UI updates for providers that support it

### Server-Side AI Optimizations

1. **Redis cache** — SHA-256 keyed, 30-minute TTL, degrades gracefully if Redis down
2. **Token capping** — `MAX_TOKENS_CAP` (default 2048) prevents cost abuse
3. **Job queuing** — RabbitMQ distributes work across multiple workers
4. **Dead-letter queue** — failed messages land in DLQ instead of being lost
5. **Per-IP rate limiting** — atomic Lua sliding-window, degrades gracefully if Redis down

---

## Security Architecture

### Client-Side

| Concern | Mitigation |
|---------|------------|
| API Key Storage | AES-256-GCM encrypted in localStorage with PBKDF2-derived device key |
| XSS | React's built-in escaping; no `dangerouslySetInnerHTML` |
| Input Validation | File size limits (50MB), strict MIME/extension type checking |
| Zip Bomb | 200MB decompressed size limit in `unzipFile()` |
| Data Privacy | All book data stored in local IndexedDB; nothing sent to third parties except AI APIs |

### Server (`server/src/`)

| Concern | Mitigation |
|---------|------------|
| API Key Exposure | Keys stored server-side only; never returned to clients |
| DoS | Per-IP sliding-window rate limiting via Redis (30 req/min) |
| CORS | Configurable origin allowlist in `config.ts` |
| Cost Control | `MAX_TOKENS_CAP` clamps all provider max_tokens fields |
| SSRF | `validateUrl()` in `config.ts` blocks internal IPs (RFC1918, metadata) |
| Request Validation | JSON body schema checked in each route handler |
| Payload Size | `express.json({ limit: '1mb' })` + per-chapter and total job size limits |

---

## Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| UI Framework | React | 19.2.0 |
| Language | TypeScript | 5.9.3 |
| Build Tool | Vite | 7.3.1 |
| State | Zustand | 5.0.11 |
| Database | Dexie (IndexedDB) | 4.3.0 |
| Animation | Framer Motion | 12.34.3 |
| PDF Processing | pdfjs-dist | 5.4.624 |
| ZIP Extraction | fflate | 0.8.2 |
| OCR | tesseract.js | 7.0.0 |
| Embeddings | @xenova/transformers | 2.17.2 |
| Testing | Vitest + Testing Library | 4.0.18 / 16.3.2 |
| PWA | vite-plugin-pwa | 1.2.0 |
| Linting | ESLint + Prettier | 9.39.1 / 3.8.1 |
| Server | Express | 5.1.0 |
| Message Queue | amqplib (RabbitMQ) | 0.10.7 |
| Cache / Rate Limit | ioredis (Redis) | 5.4.1 |
| Runtime | Node.js | 22+ |

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Static Hosting (Vercel / Netlify)          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │  Static Assets  │  │  Service Worker │  │  Analytics  │  │
│  │  (dist/*.js)    │  │  (PWA / offline)│  │  (Vercel)   │  │
│  └─────────────────┘  └─────────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │ VITE_API_PROXY_URL (optional)
        ┌─────────────────────▼────────────────────────────────┐
        │            Backend (Docker Compose)                  │
        │  ┌────────────┐  ┌────────────┐  ┌────────────────┐  │
        │  │ API Server │  │  Worker×N  │  │  Redis         │  │
        │  │ :3001      │  │ (consumers)│  │  (cache + rl)  │  │
        │  └────────────┘  └────────────┘  └────────────────┘  │
        │  ┌────────────────────────────────────────────────┐  │
        │  │  RabbitMQ :5672 (jobs) / :15672 (management)  │  │
        │  └────────────────────────────────────────────────┘  │
        └──────────────────────────────────────────────────────┘
                              │
       ┌──────────────────────┼──────────────────────┐
       ▼                      ▼                      ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  Gemini API   │    │  OpenAI API   │    │  Ollama local │
└───────────────┘    └───────────────┘    └───────────────┘
```

**Production Checklist:**
- [x] PWA manifest configured
- [x] Service worker precaching (vite-plugin-pwa)
- [x] Hidden sourcemaps (`sourcemap: 'hidden'`)
- [x] Chunk size warnings configured
- [x] Vercel Analytics integration
- [x] Node 22+ enforced via `engines` field and `.nvmrc`
- [x] All 5 dependency CVEs resolved (`npm audit` → 0 vulnerabilities)

