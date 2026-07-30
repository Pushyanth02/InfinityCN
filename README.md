# Lemniscate

A local-first reading room where every document unfolds endlessly. Named for the lemniscate (∞), it turns any book, paper, or story into an interactive experience guided by three AI companions.

## What it does

Upload a document, and Lemniscate parses it into clean, chapter-aware text you can read, study, and reimagine. Three AI companions — powered by free [OpenRouter](https://openrouter.ai) models — work alongside you:

- **Luma** — a fast, warm conversational companion for reading. Blends vivid storytelling with quick explanations, definitions, and summaries.
- **Ouro** — a study buddy grounded in your text. Chats as a tutor and generates structured study guides, multiple-choice quizzes, and flashcards.
- **Ankaa** — a long-form creative agent. Writes full chapters, alternate endings, and original works as background jobs you can poll for.

## Capabilities

- **Document ingestion** — PDF (via pdf.js), plain text, and best-effort DOCX/EPUB, parsed into chapters and chunks.
- **Reader** — distraction-free reading with per-reader settings and an inline Luma chat.
- **Study tools** — chapter/novel summaries, quizzes, flashcards, and Markdown study guides.
- **Literary analysis** — character, dialogue, semantic, and critical analysis; theme and vocabulary extraction; narrative/plot summaries.
- **Creative studio** — continue a story, write alternate endings, build world lore, retell for kids, meet the characters, "what if" scenarios, and a co-writer.
- **OCR refinement** — cleans scanned/OCR text while preserving formatting, foreign scripts, and structure.
- **Dashboard** — library, activity history, usage analytics, and AI usage monitoring.
- **Built-in guardrails** — anonymous signed-cookie sessions, per-document ownership isolation, per-IP and account-wide rate limiting, per-user quotas, input validation, and strict security headers.

## Tech stack

- **Framework** — Next.js 16 (App Router, Turbopack) + React 19
- **Language** — TypeScript 5
- **UI** — Tailwind CSS 4 + shadcn/ui
- **Database** — Prisma ORM (SQLite in dev, PostgreSQL in production)
- **AI** — OpenRouter (OpenAI-compatible API) with free models
- **Runtime** — Bun

## Quick start

```bash
bun install
cp .env.example .env      # then add your OPENROUTER_API_KEY
bun run db:push
bun run dev
```

Open http://localhost:3000. Get a free OpenRouter key at https://openrouter.ai/keys.

## Configuration

Set these in `.env` (local) or the Render dashboard (production). See `.env.example` for the full, annotated list including per-bot model overrides and rate-limit tuning.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | SQLite `file:` (dev) or PostgreSQL `postgresql://` (prod) connection string. |
| `OPENROUTER_API_KEY` | For AI | OpenRouter key (`sk-or-...`). Without it, AI features are disabled but the app runs. |
| `LEMNISCATE_AUTH_SECRET` | Prod | Random secret for signing session cookies (`openssl rand -hex 32`). |
| `OPENROUTER_MODEL_LUMA` / `_OURO` / `_ANKAA` | No | Override the per-bot model (defaults are powerful free models). |
| `OPENROUTER_FREE_RPD` | No | Free-tier daily request ceiling. Default `1000`; set `50` if the account has no credit. |

## Deployment (Render)

Lemniscate ships with a `render.yaml` Blueprint.

1. Switch Prisma to PostgreSQL in `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"   // was "sqlite"
     url      = env("DATABASE_URL")
   }
   ```
2. Push to GitHub, then on [Render](https://render.com): **New → Blueprint** and connect the repo.
3. Render provisions a PostgreSQL database and a web service (health check at `/api/health`), auto-wiring `DATABASE_URL` and generating `LEMNISCATE_AUTH_SECRET`.
4. Add your `OPENROUTER_API_KEY` in the service's environment settings, then deploy.

## License

Private — © 2026 Lemniscate.
