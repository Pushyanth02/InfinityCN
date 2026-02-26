# Contributing to InfinityCN

## Getting Started

1. **Clone the repo**
   ```bash
   git clone https://github.com/Pushyanth02/InfinityCN.git
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
├── components/         # React components
│   ├── ui/             # Shared UI primitives (ErrorBoundary)
│   ├── __tests__/      # Component tests
│   ├── Reader.tsx      # Core reading experience
│   ├── CinematicReader.tsx
│   ├── CinematifierApp.tsx
│   ├── CinematifierSettings.tsx
│   ├── AISettings.tsx
│   ├── ThemeStudio.tsx
│   └── Upload.tsx
├── hooks/              # Custom React hooks
│   ├── useMangaCompiler.ts
│   └── useScrollLock.ts
├── lib/                # Pure utilities (no React)
│   ├── __tests__/      # Utility tests
│   ├── algorithms.ts   # NLP: TF-IDF, sentiment, readability, etc.
│   ├── ai.ts           # Multi-provider AI engine
│   ├── cinematifier.ts
│   ├── cinematifierDb.ts
│   ├── db.ts           # Dexie (IndexedDB) schema
│   ├── narrativeEngine.ts
│   ├── parser.ts
│   └── pdfWorker.ts
├── store/              # Zustand state management
│   ├── index.ts
│   └── cinematifierStore.ts
├── types/              # TypeScript type definitions
│   ├── index.ts
│   └── cinematifier.ts
├── styles.css          # CSS entry point (imports all partials)
├── index.css           # Design system, reset, utilities
├── App.css             # App layout, modals, AI settings
├── cinematifier.css    # Cinematifier-specific styles
├── reader.css          # Reader-specific styles
├── App.tsx             # Root component
├── main.tsx            # Entry point
└── test/               # Test setup
server/
└── proxy.ts            # Optional API proxy server
```

## Architecture Notes

### CSS Organization
All CSS flows through a single entry point (`src/styles.css`) which imports partials in cascade order. Responsive breakpoints are consolidated at the bottom of `styles.css` covering 480px, 768px, 1024px, and 1200px.

### AI Provider System
The AI engine (`src/lib/ai.ts`) supports 7 providers with a unified interface. When `VITE_API_PROXY_URL` is set, requests route through the optional backend proxy (`server/proxy.ts`) instead of calling providers directly from the browser.

### Offline-First
- **IndexedDB** (via Dexie) stores compiled chapters and pages locally
- **Service Worker** (via vite-plugin-pwa) precaches app assets and uses runtime caching strategies for fonts and MangaDex data
- **Offline inference** (`mangadexInference.ts`) generates manga metadata without network calls

### State Management
Zustand with `persist` middleware stores AI configuration in localStorage. UI state (panels, characters, atmosphere) is kept in memory only.

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
