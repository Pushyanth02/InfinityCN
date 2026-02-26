# InfinityCN Architecture Documentation

## Executive Summary

InfinityCN is an AI-enhanced, offline-first reader application that transforms novels and manga into cinematic, interactive panel experiences. Built with React 19 and TypeScript 5.9, it employs a modern, modular architecture with strong separation of concerns.

**Version:** 15.0.0  
**Last Updated:** February 2026

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (Browser)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │   React 19 UI    │  │   Zustand Store  │  │    IndexedDB (Dexie)     │  │
│  │   Components     │◄─┤   State Mgmt     │◄─┤    Offline Storage       │  │
│  │   (Lazy-loaded)  │  │   (Persisted)    │  │    Chapters/Settings     │  │
│  └────────┬─────────┘  └────────┬─────────┘  └──────────────────────────┘  │
│           │                     │                                           │
│           ▼                     ▼                                           │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      Core Processing Engine                          │  │
│  │  ┌────────────┐  ┌───────────────┐  ┌─────────────┐  ┌───────────┐   │  │
│  │  │ PDF Parser │  │ Text-to-Panel │  │  NLP Engine │  │ AI Client │   │  │
│  │  │ (pdfjs)    │  │   (parser.ts) │  │(algorithms) │  │  (ai.ts)  │   │  │
│  │  └────────────┘  └───────────────┘  └─────────────┘  └─────┬─────┘   │  │
│  └──────────────────────────────────────────────────────────────┼───────┘  │
└─────────────────────────────────────────────────────────────────┼──────────┘
                                                                  │
                    ┌─────────────────────────────────────────────┼──────────┐
                    │                 EXTERNAL SERVICES           │          │
                    │  ┌────────────────────────────────────────────────┐    │
                    │  │              AI Providers (7 supported)        │    │
                    │  │  ┌─────────┐ ┌────────┐ ┌──────────┐ ┌──────┐  │    │
                    │  │  │ Gemini  │ │ OpenAI │ │Anthropic │ │ Groq │  │    │
                    │  │  └─────────┘ └────────┘ └──────────┘ └──────┘  │    │
                    │  │  ┌──────────┐ ┌────────┐ ┌──────────────────┐  │    │
                    │  │  │ DeepSeek │ │ Ollama │ │ Chrome AI (Nano) │  │    │
                    │  │  └──────────┘ └────────┘ └──────────────────┘  │    │
                    │  └────────────────────────────────────────────────┘    │
                    │                                                        │
                    │  ┌────────────────────────────────────────────────┐    │
                    │  │          Optional API Proxy Server             │    │
                    │  │         (server/proxy.ts - Express)            │    │
                    │  └────────────────────────────────────────────────┘    │
                    └────────────────────────────────────────────────────────┘
```

---

## Layer Architecture

### 1. Presentation Layer (`src/components/`)

| Component | Responsibility | Loading Strategy |
|-----------|---------------|------------------|
| `App.tsx` | Root component, routing, error boundaries | Eager |
| `Reader.tsx` | Core reading experience with panels | Lazy |
| `Upload.tsx` | File drop zone for PDF/TXT | Eager |
| `AISettings.tsx` | AI provider configuration modal | Lazy |
| `ThemeStudio.tsx` | Visual theme customization | Eager |
| `CinematicReader.tsx` | Manga-style panel renderer | Lazy |
| `ErrorBoundary.tsx` | React error boundary wrapper | Eager |

**Design Decisions:**
- Heavy components (Reader, AISettings) are lazy-loaded to reduce initial bundle
- Framer Motion handles all animations for consistent 60fps performance
- Lucide React provides tree-shakeable icons

### 2. State Management Layer (`src/store/`)

**Pattern:** Zustand with persist middleware

```typescript
// Store structure
{
  // UI State (in-memory only)
  panels: MangaPanel[],
  characters: Character[],
  atmosphere: Atmosphere | null,
  insights: ChapterInsights | null,
  
  // Processing State
  isProcessing: boolean,
  progress: number,
  progressLabel: string,
  
  // Persisted AI Config (localStorage)
  aiProvider: 'none' | 'chrome' | 'gemini' | ... ,
  geminiKey: string,
  openAiKey: string,
  // ... other provider keys
}
```

**Key Features:**
- Atomic selectors prevent unnecessary re-renders
- AI configuration persisted to localStorage
- Panel data kept in memory for performance

### 3. Business Logic Layer (`src/lib/`)

| Module | Purpose | Dependencies |
|--------|---------|--------------|
| `algorithms.ts` | Pure NLP functions (tokenization, sentiment, TF-IDF) | None |
| `parser.ts` | Text-to-panel conversion engine | algorithms.ts |
| `narrativeEngine.ts` | Story structure analysis (5-act, character graphs) | algorithms.ts |
| `ai.ts` | Multi-provider AI client with caching/retry | None (external APIs) |
| `db.ts` | Dexie IndexedDB schema and operations | dexie |
| `pdfWorker.ts` | Lazy PDF extraction | pdfjs-dist |

**Critical Path:**
```
File Upload → pdfWorker.ts → parser.ts → narrativeEngine.ts → Store → UI
                    ↓
              algorithms.ts (NLP processing)
```

### 4. Data Layer (`src/lib/db.ts`)

**Database:** Dexie (IndexedDB wrapper)

**Schema:**
```typescript
interface SavedChapter {
  id?: number;           // Auto-increment primary key
  title: string;         // Chapter title
  createdAt: number;     // Unix timestamp
  panels: MangaPanel[];  // Compiled panels
  characters: Character[];
  recap: string | null;
  atmosphere: Atmosphere | null;
  insights: ChapterInsights | null;
  rawText: string;       // Original text for re-processing
}
```

### 5. Optional Backend (`server/proxy.ts`)

**Purpose:** Server-side API key management for shared deployments

**Features:**
- Per-IP rate limiting (30 req/min sliding window)
- CORS origin validation
- Max token capping (2048) to prevent cost abuse
- Health check endpoint

---

## Data Flow

### 1. File Processing Pipeline

```
┌──────────┐    ┌─────────────┐    ┌────────────┐    ┌──────────────┐
│  Upload  │───►│ PDF/TXT     │───►│ Text-to-   │───►│ IndexedDB    │
│  (Drop)  │    │ Extraction  │    │ Panel      │    │ Persistence  │
└──────────┘    └─────────────┘    │ Parser     │    └──────────────┘
                                   └─────┬──────┘
                                         │
              ┌──────────────────────────┴────────────────────────┐
              ▼                          ▼                        ▼
    ┌─────────────────┐      ┌────────────────────┐    ┌─────────────────┐
    │ Sentiment/      │      │ Scene Boundary     │    │ Atmosphere      │
    │ Tension Scoring │      │ Detection          │    │ Classification  │
    └─────────────────┘      └────────────────────┘    └─────────────────┘
```

### 2. AI Enhancement Flow

```
┌────────────┐    ┌──────────────┐    ┌───────────────────┐
│ User       │───►│ Rate Limiter │───►│ Request Dedup     │
│ Request    │    │ (Token Bucket)│   │ (In-flight Cache) │
└────────────┘    └──────────────┘    └─────────┬─────────┘
                                                │
                   ┌────────────────────────────┴─────┐
                   ▼                                  ▼
          ┌───────────────┐                  ┌───────────────┐
          │ Cache Check   │                  │ Provider Call │
          │ (TTL: 30min)  │                  │ (With Retry)  │
          └───────────────┘                  └───────────────┘
```

---

## Performance Optimizations

### Bundle Splitting Strategy

```javascript
// vite.config.ts manualChunks
{
  'pdfjs':       ['pdfjs-dist'],          // ~400KB, loaded on PDF drop
  'motion':      ['framer-motion'],       // ~123KB, animations
  'lucide':      ['lucide-react'],        // ~8KB, icons
  'dexie':       ['dexie', 'dexie-react-hooks'],
  'store':       ['zustand'],
  'html-to-image': ['html-to-image'],     // Export only
  'analytics':   ['@vercel/analytics', '@vercel/speed-insights'],
  'react':       ['react', 'react-dom']
}
```

### Lazy Loading Strategy

| Resource | Trigger | Impact |
|----------|---------|--------|
| `pdfjs-dist` | PDF file dropped | -400KB initial |
| `Reader.tsx` | Panels available | -46KB initial |
| `AISettings.tsx` | Settings button clicked | -11KB initial |
| Analytics | After mount | -10KB initial |

### CPU Optimization

1. **Time-slicing in parser.ts**: Yields every 50 panels to keep UI responsive
2. **Pre-computed sentiment**: Single-pass analysis, reused for tension scoring
3. **Map-based lookups**: O(1) atmosphere keyword matching vs O(n) regex

---

## Security Architecture

### Client-Side

| Concern | Mitigation |
|---------|------------|
| API Key Storage | User keys in localStorage (user responsibility) |
| XSS | React's built-in escaping, no dangerouslySetInnerHTML |
| Input Validation | File size limits (50MB), type checking |

### Server Proxy (`server/proxy.ts`)

| Concern | Mitigation |
|---------|------------|
| API Key Exposure | Keys stored server-side only |
| DoS | Per-IP rate limiting (30 req/min) |
| CORS | Origin whitelist enforcement |
| Cost Control | Max token capping (2048) |
| Request Validation | JSON body type checking |

---

## Scalability Considerations

### Current Limitations

1. **Single-threaded parsing**: Large files (>10MB) may block UI briefly
2. **In-memory panels**: Large chapters consume browser memory
3. **No pagination**: All panels rendered (virtual scrolling recommended)

### Recommended Improvements

1. **Web Workers**: Move NLP processing off main thread
2. **Virtual List**: Only render visible panels (react-window/react-virtualized)
3. **Streaming AI**: Use streaming responses for faster perceived latency
4. **CDN Caching**: Static assets already optimized via Vite

---

## Testing Architecture

**Framework:** Vitest + Testing Library

```
src/
├── lib/__tests__/
│   └── algorithms.test.ts    # 47 unit tests for NLP functions
├── components/__tests__/
│   └── App.test.tsx          # Component integration tests
└── test/
    └── setup.ts              # Jest-DOM matchers
```

**Coverage Areas:**
- ✅ Pure algorithm functions
- ✅ Error boundary behavior
- ✅ Lazy loading mechanics
- ⚠️ E2E tests (not implemented)
- ⚠️ AI integration tests (mocked)

---

## Technology Stack Summary

| Layer | Technology | Version |
|-------|------------|---------|
| UI Framework | React | 19.2.0 |
| Language | TypeScript | 5.9.3 |
| Build Tool | Vite | 7.3.1 |
| State | Zustand | 5.0.11 |
| Database | Dexie (IndexedDB) | 4.3.0 |
| Animation | Framer Motion | 12.34.3 |
| PDF Processing | pdfjs-dist | 5.4.624 |
| Testing | Vitest | 4.0.18 |
| PWA | vite-plugin-pwa | 1.2.0 |
| Linting | ESLint + Prettier | 9.39.1 / 3.8.1 |

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Vercel (Recommended)                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │  Static Assets  │  │  Service Worker │  │  Analytics  │  │
│  │  (dist/*.js)    │  │  (PWA)          │  │  (Optional) │  │
│  └─────────────────┘  └─────────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  AI Provider  │    │  AI Provider  │    │  Self-Hosted  │
│  (Gemini API) │    │  (OpenAI)     │    │  (Ollama)     │
└───────────────┘    └───────────────┘    └───────────────┘
```

**Production Checklist:**
- [x] PWA manifest configured
- [x] Service worker precaching
- [x] Hidden sourcemaps for debugging
- [x] Chunk size warnings configured
- [x] Analytics integration ready
