# Lemniscate

> An advanced **document-to-storytelling** platform. Transform PDF, DOCX, and TXT files into readable, structured narratives through **deterministic, offline, classical-NLP** processing.
>
> ∞ — *No LLMs. No AI APIs. No generative models. Ever.*

---

## Why Lemniscate?

Every other "document AI" tool ships your text to a third-party LLM. Lemniscate doesn't. It reconstructs paragraphs, detects scenes, characters, locations, events, narrative arcs, tension, and emotional peaks using **only** handcrafted linguistic rules, lexicons, statistical heuristics, and graph analysis.

- **Privacy-first** — all processing runs on your machine. Files never leave your deployment.
- **Deterministic** — the same input always produces the same output. Reproducible and auditable.
- **Self-hostable** — SQLite + Prisma + Socket.IO. Redis-ready for horizontal scaling.
- **No AI** — zero neural models, zero API calls, zero telemetry.

---

## Core Modes

### ORIGINAL MODE
Preserve source meaning. Repair formatting. Reconstruct proper paragraphs. Improve readability only. Output is **verbatim** story text — only structural/classification annotations are generated.

- Smart-quote & whitespace repair
- Line-break hyphenation repair (`exam-\nple` → `example`)
- Paragraph reconstruction (re-merge mid-sentence breaks, split over-fused blocks)
- Paragraph classification: `NARRATION` · `DIALOGUE` · `ACTION` · `TRANSITION` · `HEADING` · `THOUGHT`
- Readability stats (Flesch-Kincaid, sentence/word/syllable metrics)

### CINEMATIFIED MODE
Detect scenes, characters, locations, events, narrative arcs, tension, and emotional peaks; reconstruct content into cinematic storytelling. **Never invents facts, never adds characters, never alters chronology** — every line of story text is sourced verbatim from the input.

- **Scene detection** — boundaries from location/time/topic shifts, headings, transitions
- **Character detection** — capitalized proper nouns, attribution verbs (`said Elizabeth`), honorifics, dialogue attribution; role classification (Protagonist / Antagonist / Supporting / Minor)
- **Location detection** — gazetteer signals (indoor/outdoor/urban/nature/vehicle) + prepositional phrase capture
- **Event detection** — verb-based action patterns: `ACTION` · `DIALOGUE` · `DISCOVERY` · `CONFLICT` · `RESOLUTION` · `TRANSITION`
- **Narrative arcs** — signal-word density across scene zones: Inciting → Rising → Climax → Falling → Resolution
- **Tension scoring** — violence + conflict lexicons + intensifiers + punctuation density
- **Emotional peaks** — AFINN-style valence + Plutchik-inspired emotion categories with negation/intensifier handling
- **Cinematic reconstruction** — `INT./EXT. LOCATION — TIME` scene headings, screenplay-style dialogue, transition cues derived from tension deltas

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (SPA)                           │
│  Upload · Library · Processing Dashboard · Narrative Viewer    │
│         socket.io-client → /?XTransformPort=3003               │
└──────────────┬────────────────────────────────┬────────────────┘
               │ HTTP (REST)                    │ WebSocket (realtime)
               ▼                                ▼
┌──────────────────────────┐       ┌──────────────────────────────┐
│   Next.js 16 App (3000)  │       │  Lemniscate Worker (3003)    │
│  - API routes            │       │  - Socket.IO server          │
│  - Prisma → SQLite       │       │  - Job poller (800ms)        │
│  - File storage          │       │  - Pipeline orchestrator     │
└──────────┬───────────────┘       │    ├─ extract (pdf/docx/txt) │
           │                       │    ├─ original transform     │
           │  shared SQLite        │    └─ cinematified engine     │
           └───────────────────────┤  - EventBus → Socket.IO      │
                                   └──────────────┬───────────────┘
                                                  │
                              ┌───────────────────┴──────────────────┐
                              │   Queue: SQLite `Job` table          │
                              │   atomic CAS claim (updateMany)      │
                              │   durable + restart-safe · no Redis  │
                              └──────────────────────────────────────┘
```

### Request lifecycle

1. User uploads a file → `POST /api/documents/upload`
2. Next.js stores the file, hashes it, creates a `Document` + `Job` (status `QUEUED`) in SQLite
3. The **worker service** polls for `QUEUED` jobs every 800ms, atomically claims one (CAS via `updateMany`)
4. The worker runs the deterministic pipeline:
   - **EXTRACT** — `pdf-parse` / `mammoth` / raw read → plain text
   - **SEGMENT** — sentence segmentation, paragraph reconstruction
   - **ORIGINAL** — formatting repair, paragraph classification
   - **CINEMATIFY** — scene/character/location/event/arc/peak detection
   - **FINALIZE** — persist all artifacts to SQLite
5. Each stage publishes `ProgressEvent`s to the in-process `EventBus`
6. The `EventBus` fans out to all Socket.IO clients subscribed to that `jobId`
7. The browser's processing dashboard renders live progress + logs
8. On completion, the user opens the narrative viewer (Original or Cinematified)

### Document Intelligence Engine & providers

Processing is organized behind stable seams so capabilities can evolve without
rewrites:

- **CanonicalDocument** (`src/lib/canonical/`) — the single normalized model
  every parser produces and every downstream stage consumes.
- **Document Intelligence Engine** (`src/lib/intelligence/`) — turns a
  `CanonicalDocument` into structured intelligence. Engines are resolved per
  `documentType` by a router; the deterministic `NovelIntelligenceEngine`
  (wrapping the cinematified analysis) is today's default for every domain, so
  narrative analysis is *one module* of a broader engine rather than the whole
  platform. New domain engines (research paper, legal, manual, …) register in
  the router without touching the orchestrator, persistence, or the reader.
- **Provider seams** (`src/lib/providers/`) — env-selected pluggable
  implementations for `documentParser`, `relationshipAnalyzer`, `search`,
  `storage`, `queue`, and `auth` (each defaulting to a deterministic/local
  impl, except `auth` which is an unimplemented extension point for per-user
  identity — see [`docs/APPWRITE.md`](./docs/APPWRITE.md)). New formats or
  backends drop in via environment variables.
- **Services** (`src/lib/services/`) — own the business logic (documents, jobs,
  search, persistence, export, analytics, …) so API routes stay thin. A
  versioned **`/api/v1`** surface (typed response envelope, request validation,
  OpenAPI, metrics) sits alongside the legacy `/api/*` routes.

### Production scaling

The queue is backed by the SQLite `Job` table: the worker polls for `QUEUED`
rows and claims one atomically with a compare-and-set (`updateMany` guarded by
`status`). This is durable and restart-safe — stalled `PROCESSING` jobs are
re-queued on boot, and a failed-then-retried job clears its own partial
artifacts first so retries never duplicate narratives. For single-node
self-hosting (the primary use case) no external broker is required.

**Redis** (`REDIS_URL`) is optional. When set, it backs **rate limiting** with
an atomic fixed-window counter that survives restarts and is shared across
instances (in-memory fallback otherwise); the bundled `docker-compose.yml`
provisions a `redis` service and wires it to the app + worker. Redis-backed
**queue coordination / `lemniscate:events` pub-sub** for multiple Socket.IO
gateways remains a reserved, unimplemented seam — the SQLite CAS queue is the
queue regardless of `REDIS_URL`.

Horizontal scaling beyond a single node would also require moving off SQLite
(e.g. Postgres, or Turso via the bundled libSQL adapter / Prisma's swappable
`datasource`).

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript 5 |
| Styling | Tailwind CSS 4 + shadcn/ui (custom warm parchment theme) |
| Database | Prisma ORM + SQLite (file-based, self-hosted) |
| Realtime | Socket.IO (worker service, port 3003) |
| Queue | SQLite `Job` table + atomic CAS claim (durable, restart-safe) |
| Document parsing | `pdf-parse` (PDF), `mammoth` (DOCX), native (TXT) |
| State | Zustand (client) + TanStack Query patterns |
| NLP | **100% handcrafted** — no ML libraries |

---

## Project Structure

```
src/
├── app/
│   ├── api/                      # REST endpoints
│   │   ├── documents/            # upload, list, detail, delete
│   │   ├── jobs/                 # status, logs, dead-letter
│   │   ├── narratives/           # narrative + export, search, progress, bookmarks
│   │   ├── reading-progress/     # cross-narrative in-progress list
│   │   ├── sample/               # built-in sample story
│   │   ├── stats/                # dashboard aggregates
│   │   ├── health/               # liveness + database check
│   │   └── v1/                   # versioned API mirror + metrics + openapi.json
│   ├── globals.css               # Lemniscate design system (OKLCH tokens)
│   ├── layout.tsx
│   └── page.tsx                  # single-page app shell
├── components/
│   ├── ui/                       # shadcn/ui component set (Radix primitives)
│   └── lemniscate/               # app components
│       ├── shell/                # header.tsx, footer.tsx
│       ├── views/                # landing, library, processing, reader,
│       │                         #   characters, scenes, settings
│       ├── app.tsx               # root component — lazy view routing
│       ├── store.ts              # Zustand state (navigation, reader prefs, progress)
│       ├── logo.tsx              # InfinityMark, InfinityFlow, InfinityHero, Flourish
│       ├── theme-provider.tsx    # next-themes wrapper
│       ├── use-realtime.ts       # Socket.IO progress hook
│       └── use-worker-status.ts  # worker connectivity probe
├── hooks/                        # shared React hooks (use-mobile, use-toast)
├── lib/
│   ├── db.ts                     # Prisma client (SQLite, WAL mode)
│   ├── types.ts                  # shared types (ProgressEvent, PipelineStage, …)
│   ├── utils.ts                  # cn() class merge helper
│   ├── motion.ts                 # Framer Motion variants + spring presets
│   ├── logger.ts                 # structured JSON logger
│   ├── env-validation.ts         # startup env checks (fail-fast in production)
│   ├── backup.ts                 # scheduled SQLite backup scheduler
│   ├── storage/index.ts          # local file storage (read/write/delete/url)
│   ├── events/bus.ts             # in-process EventBus (ring buffer, 200 events/job)
│   ├── middleware/               # security, rate-limit (Redis/memory), validate-id, body-size
│   ├── canonical/                # CanonicalDocument model + builder + document-type detection
│   ├── domain/                   # entities, enums, structured error taxonomy
│   ├── services/                 # business logic (document, job, search, persistence, export, …)
│   ├── providers/                # pluggable seams: parser, search, storage, queue, relationship
│   ├── intelligence/             # Document Intelligence Engine + domain router (NovelIntelligenceEngine)
│   ├── api/                      # response envelope, request validation, OpenAPI
│   ├── nlp/                      # deterministic sub-engines (characters, emotion, momentum,
│   │   │                         #   relationships, scenes, structure, intelligence)
│   │   ├── core.ts               # tokenize, splitSentences, POS-lite, stats
│   │   └── lexicons.ts           # AFINN valence, Plutchik, gazetteers, arc signals
│   └── pipeline/
│       ├── extract.ts            # PDF/DOCX/TXT extraction
│       ├── extract.test.ts       # extraction unit tests
│       ├── original.ts           # ORIGINAL MODE transformer
│       ├── original.test.ts      # original mode unit tests
│       ├── cinematified.ts       # CINEMATIFIED MODE engine
│       ├── cinematified.test.ts  # cinematified mode unit tests
│       ├── orchestrator.ts       # pipeline runner + DB persistence
│       ├── job-runner.ts         # CAS claim + retry/backoff (shared module)
│       ├── embedded-poller.ts    # in-process job poller (started from instrumentation.ts)
│       └── pdf-extract-worker.mjs # isolated PDF child process (crash-safe)
├── instrumentation.ts            # Next.js startup hook (env check, backup, poller)
├── middleware.ts                 # Next.js edge middleware (pass-through)
└── __e2e__/
    └── pipeline-e2e.test.ts      # end-to-end pipeline test (requires live DB)

mini-services/
└── lemniscate-worker/            # standalone Bun worker (port 3003)
    ├── index.ts                  # Socket.IO server + job poller
    ├── package.json
    └── tsconfig.json             # @/* → ../../src/*

prisma/
└── schema.prisma                 # full data model (14 models)
```

---

## Data Model (ERD)

```
Document 1───* Job
Document 1───1 RawText
Document 1───* Narrative
Job     1───* Narrative
Job     1───* ProcessingLog

Narrative 1───* Paragraph
Narrative 1───* Scene ──* Event
Narrative 1───* Character
Narrative 1───* Location
Narrative 1───* NarrativeArc
Narrative 1───* EmotionalPeak ──? Scene
```

See `prisma/schema.prisma` for the full schema.

---

## Quickstart

```bash
# 1. Install dependencies
bun install

# 2. Push the database schema
bun run db:push

# 3. Start the Next.js app (port 3000)
bun run dev

# 4. Start the realtime worker (port 3003) — in another terminal
cd mini-services/lemniscate-worker
bun install
bun run dev
```

Open the app via the **Preview Panel** (not `localhost:3000` directly).

### Try it

1. Click **"Try the sample story"** to enqueue "The Last Lighthouse of Veyrn".
2. Watch the live processing dashboard (pipeline stages + log stream).
3. When complete, open the **Cinematified** narrative to explore scenes, characters, arcs, tension, and peaks.

---

## Deterministic NLP Methodology

Lemniscate's "intelligence" comes entirely from curated rules and lexicons — no statistical models.

| Capability | Method |
|---|---|
| Tokenization | Regex character-class tokenizer |
| Sentence segmentation | Rule-based: terminators + abbreviation table + decimal/initial guards |
| Paragraph reconstruction | Heuristic merge (mid-sentence breaks) + split (topic-shift leaders) |
| POS tagging | Suffix/prefix + closed-class lexicon (deterministic regex) |
| Character detection | Capitalized proper nouns + attribution-verb co-occurrence + honorifics |
| Location detection | 5-category gazetteer + prepositional-phrase capture |
| Scene segmentation | Location/time/topic-shift boundaries + heading/transition detection |
| Event detection | Action-verb lexicon + discovery/conflict/resolution signal sets |
| Narrative arcs | Signal-word density across 5 equal scene zones |
| Tension | Violence + conflict lexicon + intensifiers + punctuation density |
| Emotion | AFINN-style valence + Plutchik categories + negation/intensifier multipliers |
| Readability | Flesch-Kincaid (syllable counting via vowel-group heuristics) |

All lexicons live in `src/lib/nlp/lexicons.ts` and are hand-curated.

---

## Constraints Honored

1. ✅ No LLMs / AI APIs / generative models — verified, zero AI dependencies.
2. ✅ Deterministic & fully offline — no outbound network calls during processing.
3. ✅ Classical NLP, heuristics, rule engines, lexicons, graph analysis.
4. ✅ Production-grade single-node architecture (durable SQLite queue, standalone worker).
5. ✅ Durable background workers (SQLite `Job` table + atomic CAS claim; restart-safe).
6. ✅ Responsive frontend (live progress via Socket.IO).
7. ✅ Users own their content (files stored locally, deletable).
8. ✅ Privacy-first (no telemetry, no cloud).
9. ✅ Self-hosted deployment (SQLite + Prisma + single binary worker).
10. ✅ Clean, maintainable, enterprise-level code (typed, linted, documented).

---

## Deployment

### Docker (recommended for self-hosting)

The bundled `docker-compose.yml` provisions the full stack — Next.js app,
standalone worker, Redis (rate-limit counters), and Caddy reverse proxy.

```bash
cp .env.example .env          # then set LEMNISCATE_API_KEY (≥16 chars) and LEMNISCATE_ALLOWED_ORIGINS
docker compose up --build     # app on :3000, worker :3003 (internal), Caddy on :81
```

The runtime image is a multi-stage, non-root build with a baked schema seed
(so an empty named volume initializes on first boot) and a healthcheck. See
[`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) for details.

### Vercel (serverless)

Lemniscate also deploys to Vercel with Turso (libSQL) as the database backend.
Copy [`.env.vercel.example`](./.env.vercel.example) into the Vercel project's
environment variables, then deploy — `vercel.json` wires the build command and
per-route `maxDuration` overrides.

See [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) for the Vercel + Turso setup
walkthrough, and [`docs/APPWRITE.md`](./docs/APPWRITE.md) for the Appwrite
integration design (an unimplemented `auth` provider seam today).

---

## License

MIT — see [`LICENSE`](./LICENSE). Built for storytellers who value their data.
