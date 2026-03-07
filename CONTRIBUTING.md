# Contributing to InfinityCN

## Getting Started

1. **Clone the repo**
   ```bash
   git clone https://github.com/Pushyanth02/InfinityCN.git
   cd InfinityCN
   ```

2. **Use the correct Node version** (via [nvm](https://github.com/nvm-sh/nvm))
   ```bash
   nvm use   # reads .nvmrc → Node 22
   ```

3. **Install frontend dependencies**
   ```bash
   npm install
   ```

4. **Start the dev server**
   ```bash
   npm run dev
   ```

## Development Workflow

### Branch naming
- `feat/description` — new features
- `fix/description` — bug fixes
- `refactor/description` — code structure changes
- `docs/description` — documentation only

### Before committing
Pre-commit hooks run automatically via husky + lint-staged:
- **Prettier** formats `.ts`, `.tsx`, `.css` files
- **ESLint** checks and auto-fixes `.ts`, `.tsx` files

To run manually:
```bash
npm run format        # Format all source files
npm run format:check  # Check formatting without writing
npm run lint          # Run ESLint
```

### Testing
```bash
npm test              # Run all tests once
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
```

Tests use **Vitest** with `jsdom` environment. Test files live next to the code they test in `__tests__/` directories.

### Type checking
```bash
npx tsc -b --noEmit
```

### Building
```bash
npm run build
npm run preview       # Preview the production build locally
```

## Project Structure

```
src/
├── components/
│   ├── CinematifierApp.tsx      # Main app: upload → process → read
│   ├── CinematicReader.tsx      # Dual-mode reader with ambient audio
│   ├── CinematifierSettings.tsx # AI provider configuration
│   ├── ui/
│   │   └── ErrorBoundary.tsx    # React error boundary
│   └── __tests__/
│       └── CinematifierApp.test.tsx  # Component tests
├── lib/
│   ├── ai.ts                    # Multi-provider AI engine (7 providers)
│   ├── cinematifier.ts          # Cinematification transformation engine
│   ├── cinematifierDb.ts        # IndexedDB persistence (Dexie)
│   ├── crypto.ts                # AES-GCM encryption (SubtleCrypto)
│   ├── embeddings.ts            # Semantic embeddings (MiniLM)
│   ├── audioSynth.ts            # Ambient audio (Web Audio API)
│   ├── pdfWorker.ts             # Document extraction (PDF/EPUB/DOCX/PPTX/TXT)
│   └── serverJobs.ts            # Frontend client for the server job API
├── store/
│   └── cinematifierStore.ts     # Zustand state with encrypted persistence
├── types/
│   └── cinematifier.ts          # Type definitions
├── test/
│   └── setup.ts                 # Vitest setup
├── main.tsx                     # Entry point
├── styles.css                   # CSS entry (imports partials)
└── cinematifier.css             # Reader styles
server/
└── src/
    ├── index.ts                 # Express API server entry point
    ├── worker.ts                # RabbitMQ job consumer
    ├── config.ts                # Centralized config from env vars
    ├── types.ts                 # Server-side type definitions
    ├── lib/
    │   ├── cinematifier.ts      # Server-side cinematification engine
    │   └── hash.ts              # SHA-256 content hashing
    ├── middleware/
    │   ├── cors.ts              # CORS origin validation
    │   ├── rateLimit.ts         # Redis sliding-window rate limiter
    │   └── errorHandler.ts      # Centralized Express error handler
    ├── routes/
    │   ├── ai.ts                # AI proxy routes with Redis caching
    │   ├── jobs.ts              # Job submission, status, SSE events
    │   └── health.ts            # Health check with service status
    └── services/
        ├── aiProvider.ts        # Server-side AI provider calls
        ├── cache.ts             # Redis AI response cache
        ├── jobManager.ts        # Job lifecycle state management
        ├── rabbitmq.ts          # RabbitMQ connection and topology
        └── redis.ts             # Redis client singleton with Pub/Sub
```

## Architecture Notes

### Cinematification Pipeline
1. **Document Upload** — File validation (50MB limit), format detection
2. **Text Extraction** — pdfjs-dist, fflate (EPUB/DOCX/PPTX), native (TXT)
3. **Chapter Segmentation** — Automatic chapter detection with `segmentChapters()`
4. **AI Transformation** — Chunk text, call AI provider, parse cinematified blocks
5. **Streaming Display** — Block-by-block rendering with emotion-aware animations

### AI Provider System
The AI engine (`src/lib/ai.ts`) supports 7 providers with a unified interface:
- Request deduplication to prevent duplicate in-flight API calls
- Token bucket rate limiting per provider
- LRU cache with 30-minute TTL
- Automatic retry with exponential backoff
- Streaming support for Gemini, OpenAI, Anthropic, Groq

### Backend Server
The optional Express server (`server/src/`) adds:
- **Redis caching** — AI responses cached by content hash, 30-minute TTL
- **RabbitMQ jobs** — Async cinematification with dead-letter queue and retry
- **Redis rate limiting** — Atomic Lua-based sliding-window per IP
- **SSE events** — Real-time job progress via Redis Pub/Sub

### Encrypted Storage
API keys are encrypted using AES-GCM (Web Crypto API) with a device-derived key:
- PBKDF2 key derivation (100k iterations)
- Random IV per encryption
- Automatic migration from legacy XOR obfuscation

### Offline-First
- **IndexedDB** (via Dexie) stores full book data with chapters and cinematic blocks
- **Service Worker** (via vite-plugin-pwa) precaches app assets
- **Offline Fallback** — Algorithmic cinematification without AI

### State Management
Zustand with `persist` middleware. API keys are encrypted before localStorage persistence.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_API_PROXY_URL` | No | URL of the API server (e.g., `http://localhost:3001`) |

AI provider keys are entered by the user in the AI Settings panel and stored in browser localStorage.

## Server Development

```bash
cd server

# Install dependencies
npm install

# Start API server in watch mode
npm run dev

# Start worker in watch mode (separate terminal)
npm run dev:worker

# Type-check server code
npm run typecheck
```

## Code Style

- **Formatting**: Prettier with single quotes, 4-space tabs, trailing commas, 100-char line width
- **Linting**: ESLint with TypeScript and React Hooks recommended rules
- **Naming**: camelCase for functions/variables, PascalCase for components/types
- **Imports**: Named exports preferred; barrel exports for `components/ui/`
