# Contributing to InfinityCN

## Getting Started

1. **Clone the repo**
   ```bash
   git clone https://github.com/your-username/InfinityCN.git
   cd InfinityCN
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the dev server**
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
│       └── App.test.tsx         # Component tests
├── lib/
│   ├── ai.ts                    # Multi-provider AI engine (7 providers)
│   ├── cinematifier.ts          # Cinematification transformation
│   ├── cinematifierDb.ts        # IndexedDB persistence (Dexie)
│   ├── crypto.ts                # AES-GCM encryption (SubtleCrypto)
│   ├── embeddings.ts            # Semantic embeddings (MiniLM)
│   ├── audioSynth.ts            # Ambient audio (Web Audio API)
│   └── pdfWorker.ts             # Document extraction (PDF/EPUB/DOCX/PPTX/TXT)
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
└── proxy.ts                     # Optional API proxy server
```

## Architecture Notes

### Cinematification Pipeline
1. **Document Upload** — File validation (50MB limit), format detection
2. **Text Extraction** — pdfjs-dist, fflate (EPUB/DOCX/PPTX), native (TXT)
3. **Chapter Segmentation** — Automatic chapter detection with `segmentChapters()`
4. **AI Transformation** — Chunk text, call AI provider, parse cinematified blocks
5. **Streaming Display** — Block-by-block rendering with emotion-aware animations

### AI Provider System
The AI engine (`src/lib/ai.ts`) supports 7 providers with unified interface:
- Request deduplication to prevent duplicate API calls
- Token bucket rate limiting per provider
- LRU cache with 30-minute TTL
- Automatic retry with exponential backoff
- Streaming support for Gemini, OpenAI, Anthropic, Groq

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
| `VITE_MANGADEX_CLIENT_ID` | No | MangaDex client ID (has default fallback) |
| `VITE_API_PROXY_URL` | No | URL of the API proxy server (e.g., `http://localhost:3001`) |

AI provider keys are entered by the user in the AI Settings panel and stored in browser localStorage.

## Code Style

- **Formatting**: Prettier with single quotes, 4-space tabs, trailing commas, 100-char line width
- **Linting**: ESLint with TypeScript and React Hooks recommended rules
- **Naming**: camelCase for functions/variables, PascalCase for components/types
- **Imports**: Named exports preferred; barrel exports for `components/ui/`
