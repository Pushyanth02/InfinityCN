# Technology Stack

**Analysis Date:** 2026-05-03

## Languages

**Primary:**
- TypeScript 6.0.3 - Core logic and UI components
- React 19.2.5 - Frontend framework

**Secondary:**
- CSS - Styling (`styles.css`, `cinematifier.css`)

## Runtime

**Environment:**
- Node.js >=22.12.0 (for tooling & build, as well as dev server)
- Browser - Target environment (ESNext)

**Package Manager:**
- npm >=8.0.0

## Frameworks

**Core:**
- React 19.2.5 - View library
- Vite 8.0.8 - Build tool and Dev Server

**Testing:**
- Vitest 4.1.4 - Test runner
- React Testing Library 16.3.2 - Component testing

**State Management:**
- Zustand 5.0.12 - Global state and stores

## Key Dependencies

**Machine Learning & Processing:**
- `@xenova/transformers` 2.17.2 - Local AI embeddings and models
- `onnxruntime-web` 1.24.3 - ML inference engine
- `tesseract.js` 7.0.0 - OCR processing
- `pdfjs-dist` 5.6.205 - PDF extraction
- `fflate` 0.8.2 - File extraction (EPUB/DOCX)

**Infrastructure & DB:**
- `appwrite` 24.2.0 - Backend client
- `dexie` 4.4.2 - Offline-first IndexedDB wrapper

**UI & Animation:**
- `framer-motion` 12.38.0 - UI animations
- `lucide-react` 1.8.0 - Icon set

## Configuration

**Environment:**
- Loaded via Vite built-in support (`import.meta.env`).

**Build:**
- `vite.config.ts` - Defines test structure, PWA generation, and specific manual chunks for heavy dependencies (PDF.js, ONNX, Tesseract).
- `eslint.config.js` - Flat ESLint configuration.
- `tsconfig.json`

## Platform Requirements

**Design Context:**
- Offline-first web application running fully entirely in-browser, lazy loading extensive web assembly models securely.

---

*Stack analysis: 2026-05-03*
