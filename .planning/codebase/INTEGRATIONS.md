# External Integrations

**Analysis Date:** 2026-03-25

## APIs & External Services

**AI Providers:**
- **Google Gemini** - Primary AI engine (Flash 2.5)
  - Integration: Node-side via `GEMINI_API_KEY` or direct browser calls
  - Endpoints: `generateContent`
- **OpenAI** - GPT-4o-mini support
  - Integration: REST API via `OPENAI_API_KEY`
- **Anthropic Claude** - Claude 3.5 Sonnet support
  - Integration: REST API via `ANTHROPIC_API_KEY`
- **Groq** - Llama 3.3 70B support (Fast inference)
  - Integration: OpenAI-compatible REST API
- **DeepSeek** - High-efficiency AI support
  - Integration: OpenAI-compatible REST API
- **Ollama** - Local AI support
  - Integration: Local REST API (`http://localhost:11434`)
- **Chrome AI (Gemini Nano)** - Built-in browser AI
  - Integration: `window.ai.languageModel` API

## Data Storage

**IndexedDB (Client-side):**
- **Dexie** - Primary persistence for books and reading progress
  - Database: `CinematifierDB`
  - Tables: `books`, `readingProgress`
  - Purpose: Offline-first storage, survival across sessions

**Redis (Server-side):**
- **oredis** - Caching for AI proxy responses
  - Purpose: Cache AI responses for 30 min (TTL) to reduce costs/latency
  - Prefix: `icn:`

## Messaging & Queuing

**RabbitMQ:**
- **amqplib** - Job queuing for large book cinematification
  - Queue: Backend workers consume jobs for server-side processing
  - Exchange: Default amqp exchange

## Monitoring & Observability

**Vercel Analytics:**
- **@vercel/analytics** & **@vercel/speed-insights**
  - Purpose: Real-time traffic and performance monitoring

## CI/CD & Deployment

**Hosting:**
- **Vercel** - Frontend hosting
- **Docker** - Containerized backend infrastructure (API Server, Workers)

**CI Pipeline:**
- **GitHub Actions** - CI/CD workflows (`.github/workflows/ci.yml`)

## Environment Configuration

**Development:**
- Required: `PORT`, `REDIS_URL`, `RABBITMQ_URL`
- AI Keys: `GEMINI_API_KEY`, `OPENAI_API_KEY`, etc. (stored in `.env` or localStorage)

**Security:**
- AES-GCM encryption for API keys stored in browser `localStorage`
- Redis-backed sliding-window rate limiting on the API server

## Webhooks & Callbacks

**Incoming:**
- `GET /api/jobs/:bookId/events` - SSE stream for real-time progress updates from the server job manager

---
*Integration audit: 2026-03-25*
