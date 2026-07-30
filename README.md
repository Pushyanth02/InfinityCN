# Lemniscate

A local-first reading room where every document unfolds endlessly. Named for the lemniscate (∞), Lemniscate turns any document into an interactive experience with three AI companions: **Luma** (fast chat), **Ouro** (literary study), and **Ankaa** (long-form creative writing).

## Quick Start (Local Development)

```bash
# 1. Install dependencies
bun install

# 2. Set up the database
cp .env.example .env
bun run db:push

# 3. Start the dev server
bun run dev
```

Open http://localhost:3000 in your browser.

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **Database**: Prisma ORM (SQLite for dev, PostgreSQL for production)
- **AI**: z-ai-web-dev-sdk (Luma, Ouro, Ankaa bots)
- **Auth**: Anonymous session via signed cookies

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/                # API routes
│   │   ├── ai/             # AI bot routes (luma, ouro, ankaa, analyze, create)
│   │   ├── documents/      # Document CRUD + analysis jobs
│   │   ├── stories/        # Story creation
│   │   └── health/         # Health check
│   ├── globals.css         # Global styles + cosmic theme
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Main page (client-side routing)
├── components/             # React components
│   ├── reader/             # Reader view + Luma chat
│   ├── landing/            # Landing page
│   ├── dashboard/          # Dashboard + analytics + history
│   ├── library/            # Library view
│   ├── create/             # Story creation view
│   ├── settings/           # Settings view
│   ├── nav/                # App header
│   └── ui/                 # shadcn/ui + custom components
├── lib/                    # Server-side utilities
│   ├── auth.ts             # Anonymous session auth
│   ├── quota.ts            # Per-user quotas + ownership
│   ├── ai-helpers.ts       # AI completion + retry + usage tracking
│   ├── ai-cache.ts         # AI result caching
│   ├── ai-auth.ts          # Centralized AI route protection
│   ├── rate-limit.ts       # Rate limiting
│   ├── security.ts         # Security headers
│   ├── safe-error.ts       # Error sanitization
│   ├── logger.ts           # Structured logging
│   ├── env.ts              # Environment validation
│   ├── activity-meta.ts    # Activity type labels + icons
│   ├── api-schemas.ts      # Zod request validation schemas
│   ├── db.ts               # Prisma client
│   └── engine/             # Core parsing engine
├── hooks/                  # React hooks (use-api, use-reader-settings)
└── prisma/                 # Prisma schema
```

## Opening in Kiro IDE

1. Open Kiro IDE
2. File → Open Folder → select the project root
3. Kiro will detect Next.js automatically
4. Run `bun install` in the Kiro terminal
5. Run `bun run db:push` to set up the database
6. Run `bun run dev` to start the dev server

## GitHub Integration

1. Create a new repository on GitHub
2. In the project root:
   ```bash
   git remote add origin https://github.com/yourusername/lemniscate.git
   git push -u origin main
   ```
3. The CI workflow (`.github/workflows/ci.yml`) will automatically run lint, typecheck, and build on every PR and push.

## Deployment

### Prerequisites (Both Platforms)

Before deploying, you MUST switch the database from SQLite to PostgreSQL:

1. Edit `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"   # was "sqlite"
     url      = env("DATABASE_URL")
   }
   ```

2. Set up a PostgreSQL database (see `.env.example` for connection string formats)

3. Run `bun run db:push` to create the schema on the new database

### Deploy to Vercel

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → import your GitHub repo
3. Vercel auto-detects Next.js — the `vercel.json` config is already set
4. Add environment variables in Vercel dashboard:
   - `DATABASE_URL` — your PostgreSQL connection string
   - `LEMNISCATE_AUTH_SECRET` — a random 32-byte hex string (run `openssl rand -hex 32`)
5. Deploy — Vercel runs `bun run db:generate && next build` automatically

### Deploy to Render

1. Push your code to GitHub
2. Go to [render.com](https://render.com) → New → Blueprint
3. Connect your GitHub repo — Render reads `render.yaml` automatically
4. Render creates:
   - A PostgreSQL database (`lemniscate-db`)
   - A web service (`lemniscate`) with health check at `/api/health`
5. The `DATABASE_URL` is auto-set from the Render PostgreSQL database
6. Set `LEMNISCATE_AUTH_SECRET` in the Render dashboard (or let `generateValue: true` handle it)
7. Deploy — Render runs `bun install && bun run db:generate && bun run build:standalone`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Database connection string (SQLite `file:` or PostgreSQL `postgresql://`) |
| `LEMNISCATE_AUTH_SECRET` | Prod | Random secret for signing session cookies |
| `NODE_ENV` | Auto | `production` in deployed environments |

## License

Private — © 2026 Lemniscate.
