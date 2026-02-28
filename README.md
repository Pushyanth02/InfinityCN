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
- **Smart Parsing** — Automatic chapter segmentation with paragraph reconstruction
- **Lazy Loading** — Heavy dependencies (pdfjs, fflate) load only when needed

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
- **Responsive** — 480px mobile to 1200px+ desktop
- **Backend Proxy** — Optional server for centralized API key management

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
| Testing | Vitest + Testing Library |
| Linting | ESLint + Prettier |
| Hooks | Husky + lint-staged |
| CI/CD | GitHub Actions |

## Getting Started

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
| `VITE_API_PROXY_URL` | Backend proxy URL for server-side API keys | No |

AI API keys are configured at runtime through the in-app AI Settings panel and stored encrypted (AES-GCM) in browser localStorage. For production deployments with shared keys, use the optional backend proxy (see below).

## Backend Proxy (Recommended for Production)

The backend proxy (`server/proxy.ts`) provides several benefits:

- **Centralized API key management** — Store keys server-side, not in browser
- **Usage tracking** — Monitor and control API usage
- **Request queuing** — Per-IP rate limiting (30 req/min by default)
- **Security** — API keys never exposed to client

### Setup

1. **Configure environment variables** (server-side):

```bash
# Copy the example env file
cp .env.example .env

# Edit with your API keys
nano .env
```

2. **Start the proxy server**:

```bash
# Using tsx (recommended)
npx tsx server/proxy.ts

# Or with ts-node
npx ts-node server/proxy.ts
```

3. **Configure the frontend** to use the proxy:

```bash
# In your .env or shell
VITE_API_PROXY_URL=http://localhost:3001
```

### Proxy Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Proxy server port | `3001` |
| `ALLOWED_ORIGINS` | Comma-separated allowed CORS origins | `http://localhost:5173` |
| `GEMINI_API_KEY` | Google Gemini API key | — |
| `OPENAI_API_KEY` | OpenAI API key | — |
| `ANTHROPIC_API_KEY` | Anthropic API key | — |
| `GROQ_API_KEY` | Groq API key | — |
| `DEEPSEEK_API_KEY` | DeepSeek API key | — |
| `OLLAMA_URL` | Local Ollama server URL | `http://localhost:11434` |

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check, lists available providers |
| `/api/ai/:provider` | POST | Proxy AI request to specified provider |

## Project Structure

```
src/
  components/
    CinematifierApp.tsx      # Main app: upload → process → read flow
    CinematicReader.tsx      # Dual-mode reader with ambient audio
    CinematifierSettings.tsx # AI provider configuration
    ui/
      ErrorBoundary.tsx      # React error boundary
    __tests__/
      CinematifierApp.test.tsx  # Component tests
  lib/
    ai.ts                    # Multi-provider AI engine with streaming
    cinematifier.ts          # Text-to-cinematic transformation
    cinematifierDb.ts        # IndexedDB persistence (Dexie)
    crypto.ts                # AES-GCM key encryption (SubtleCrypto)
    embeddings.ts            # Semantic embeddings (all-MiniLM-L6-v2)
    audioSynth.ts            # Procedural ambient audio (Web Audio API)
    pdfWorker.ts             # Multi-format document extraction
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
  proxy.ts                   # Optional Express API proxy
.github/
  workflows/ci.yml           # GitHub Actions CI pipeline
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development workflow, architecture notes, and code style guidelines.

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](./docs/ARCHITECTURE.md) | System design, data flow, technology stack |
| [AI Guide](./docs/AI_GUIDE.md) | AI provider configuration and optimization |
| [DevOps Guide](./docs/DEVOPS_GUIDE.md) | CI/CD, deployment, monitoring |
| [Optimization Roadmap](./docs/OPTIMIZATION_ROADMAP.md) | Technical audit and improvement plan |
| [Security Policy](./SECURITY.md) | Vulnerability reporting and security practices |

## License

Private.
