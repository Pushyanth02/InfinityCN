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
Preserve source meaning. Repair formatting. Reconstruct proper paragraphs. Improve readability only.

- Smart-quote & whitespace repair
- Line-break hyphenation repair (`exam-\nple` → `example`)
- Paragraph reconstruction (re-merge mid-sentence breaks, split over-fused blocks)
- Paragraph classification: `NARRATION` · `DIALOGUE` · `ACTION` · `TRANSITION` · `HEADING` · `THOUGHT`
- Readability stats (Flesch-Kincaid, sentence/word/syllable metrics)

### CINEMATIFIED MODE
Detect scenes, characters, locations, events, narrative arcs, tension, and emotional peaks. Reconstruct content into cinematic storytelling. **Never invents facts. Never adds characters. Never alters chronology.**

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

### Production scaling

The queue is backed by the SQLite `Job` table: the worker polls for `QUEUED`
rows and claims one atomically with a compare-and-set (`updateMany` guarded by
`status`). This is durable and restart-safe — stalled `PROCESSING` jobs are
re-queued on boot. For single-node self-hosting (the primary use case) no
external broker is required.

Horizontal scaling beyond a single node would require moving off SQLite (e.g.
Postgres or Turso via Prisma's swappable `datasource`) and, optionally, a
Redis-backed queue + `lemniscate:events` pub/sub fan-out for multiple Socket.IO
gateways. **These are not implemented today** — `REDIS_URL` is reserved for
that future work.

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
│   │   └── health/               # liveness + database check
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
│   ├── middleware/               # security, rate-limit, validate-id, body-size
│   ├── nlp/
│   │   ├── core.ts               # tokenize, splitSentences, POS-lite, stats
│   │   ├── core.test.ts          # unit tests for NLP primitives
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

## License

Built for storytellers who value their data. Self-hostable.
