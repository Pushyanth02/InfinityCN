# Technology Stack

**Analysis Date:** 2026-03-25

## Languages

**Primary:**
- TypeScript 5.9.3 - All application code (frontend and backend)
- C# (.NET) - Core engine logic in `dotnet/` directory

**Secondary:**
- JavaScript - Build scripts, configuration files
- CSS - Styling (Modularized Vanilla CSS)

## Runtime

**Environment:**
- Node.js v24.11.1 - Backend and build environment
- Browser - Frontend execution

**Package Manager:**
- npm 11.6.2
- Lockfile: `package-lock.json` present in root and `server/`

## Frameworks

**Core:**
- React 19.2.4 - UI Framework
- Express 5.2.1 - Backend API Server
- .NET - Core engine solution (`Cinematifier.sln`)

**Testing:**
- Vitest 4.0.18 - Unit and component testing
- Testing Library (@testing-library/react) - React testing utilities

**Build/Dev:**
- Vite 8.0.0 (Rolldown) - Frontend bundler
- tsx - TypeScript execution for server development
- Husky/lint-staged - Git hooks and pre-commit linting

## Key Dependencies

**Critical:**
- @xenova/transformers (all-MiniLM-L6-v2) - Semantic embeddings and ML tasks
- Dexie (IndexedDB) - Offline-first data persistence
- Framer Motion - UI animations and transitions
- Tesseract.js - OCR support for scanned documents
- pdfjs-dist - PDF text extraction

**Infrastructure:**
- Zustand - State management with persistence
- ioredis - Redis client for server-side caching
- amqplib - RabbitMQ client for job queuing
- uuid - Unique ID generation

## Configuration

**Environment:**
- `.env` files for localized settings
- `VITE_API_PROXY_URL` for frontend-to-backend routing

**Build:**
- `vite.config.ts` - Frontend build configuration
- `tsconfig.json` - TypeScript compiler options (root, client, server)
- `eslint.config.js` - Linting configuration

## Platform Requirements

**Development:**
- Node.js ^20.19.0 || >=22.12.0
- Docker (optional) - For running Redis/RabbitMQ infrastructure

**Production:**
- Vercel-ready frontend
- Docker-composable backend services (Redis, RabbitMQ, API, Workers)

---
*Stack analysis: 2026-03-25*
