# InfinityCN

An AI-enhanced, offline-first reader that transforms novels and manga into cinematic, interactive panel experiences. Upload a PDF or TXT file and the app parses it into styled manga-like panels with character extraction, narrative arc detection, mood analysis, and optional AI enrichment.

## Features

- **Text-to-Panel Conversion** -- Automatically segments text into cinematic panels with mood-based styling
- **Character Extraction** -- NER-style detection of characters with frequency, sentiment, and honorific tracking
- **Narrative Analysis** -- Story structure detection (3-act, 5-act, hero's journey), tension scoring, emotional arc
- **Dialogue Attribution** -- Identifies dialogue lines and attributes speakers
- **Vocabulary & Readability** -- Flesch-Kincaid readability, TF-IDF keywords, vocabulary richness (TTR)
- **MangaDex Integration** -- Browse, search, and cache manga directly in the app
- **Multi-AI Provider Support** -- Gemini, OpenAI, Anthropic, Groq, DeepSeek, Ollama, Chrome AI (Gemini Nano)
- **Offline-First** -- IndexedDB caching via Dexie + PWA service worker for full offline operation
- **Responsive Design** -- Optimized layouts from 480px mobile to 1200px+ desktop
- **Library Management** -- Save, bookmark, and revisit chapters in-browser
- **Export** -- Export panels as PNG images or JSON data
- **Theme Studio** -- Customisable panel styling and colour themes

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
| `VITE_MANGADEX_CLIENT_ID` | MangaDex API client ID | No (has fallback) |
| `VITE_API_PROXY_URL` | Backend proxy URL for server-side API keys | No |

AI API keys are configured at runtime through the in-app AI Settings panel and stored in browser localStorage. For production deployments with shared keys, use the optional backend proxy (`server/proxy.ts`).

## Project Structure

```
src/
  components/       UI components (Reader, Upload, ThemeStudio, AISettings, etc.)
  components/ui/    Shared UI primitives (ErrorBoundary)
  lib/              Core logic (algorithms, AI engine, parser, narrative engine)
  hooks/            Custom React hooks (useMangaCompiler, useScrollLock)
  store/            Zustand state management
  types/            TypeScript type definitions
  test/             Test setup
  styles.css        CSS entry point (imports all partials + responsive breakpoints)
  App.tsx           Root component with error boundaries and lazy loading
  main.tsx          Entry point
server/
  proxy.ts          Optional Express API proxy for server-side API keys
.github/
  workflows/ci.yml  GitHub Actions CI pipeline (lint, test, build)
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
