# Lemniscate — Architecture

> Deterministic, offline document-to-storytelling. This document describes the
> system architecture, data flow, and design decisions in depth.

## 1. System Topology

Lemniscate is a three-process system (two in the minimal deployment):

```
 ┌──────────────┐      REST       ┌──────────────────┐
 │   Browser    │ ──────────────► │  Next.js (3000)  │
 │   (SPA)      │                 │  - API routes    │
 │              │ ◄────────────── │  - Prisma/SQLite │
 └──────┬───────┘                 │  - File storage  │
        │                          └────────┬─────────┘
        │ WebSocket                         │ shared SQLite (file)
        │ /?XTransformPort=3003             │
        ▼                                   ▼
 ┌──────────────────┐                 ┌──────────────┐
 │  Worker (3003)   │ ── reads/writes │  SQLite DB   │
 │  - Socket.IO     │ ──────────────► │  custom.db   │
 │  - Job poller    │                 └──────────────┘
 │  - Pipeline      │
 │  - EventBus      │
 └──────────────────┘
```

> **No Redis.** `REDIS_URL` is reserved for future horizontal scaling but is
> not implemented. The queue is backed by the SQLite `Job` table with atomic
> CAS claims. See §3.

### Process responsibilities

| Process | Port | Role |
|---|---|---|
| Next.js app | 3000 | Public web app, REST API, file storage, Prisma access |
| Lemniscate worker | 3003 | Socket.IO server, job poller, pipeline executor, event bus |

The worker is a standalone Bun service (`mini-services/lemniscate-worker/`) that
imports the shared `src/lib/...` modules via a tsconfig path alias
(`@/*` → `../../src/*`).

## 2. Data Flow — Upload to Narrative

```
User                Next.js API          SQLite            Worker              Browser (WS)
 │                      │                  │                  │                     │
 │── upload file ──────►│                  │                  │                     │
 │                      │── save file ─────►│ (filesystem)     │                     │
 │                      │── hash file       │                  │                     │
 │                      │── Document.create ►                  │                     │
 │                      │── Job.create     ► (QUEUED)          │                     │
 │◄── { jobId } ────────│                  │                  │                     │
 │                      │                  │                  │                     │
 │── open dashboard ──────────────────────────────────────────────────────────────► │
 │                      │                  │   ◄── subscribe(jobId) ────────────── │
 │                      │                  │                  │                     │
 │                      │                  │◄── poll QUEUED ──│                     │
 │                      │                  │── CAS claim ────►│ (PROCESSING)        │
 │                      │                  │                  │                     │
 │                      │                  │                  │── EXTRACT           │
 │                      │                  │                  │   read file         │
 │                      │                  │                  │── SEGMENT           │
 │                      │                  │                  │── ORIGINAL          │
 │                      │                  │                  │── CINEMATIFY        │
 │                      │                  │                  │── FINALIZE          │
 │                      │                  │                  │   persist artifacts │
 │                      │                  │                  │── publish events ──►│ (live)
 │                      │                  │◄── Job.update ───│ (COMPLETED)         │
 │                      │                  │                  │                     │
 │── GET /narratives/:id ─►                │                  │                     │
 │◄── narrative + scenes/chars/… ──────────│                  │                     │
```

## 3. Queue Design

The queue is backed directly by the SQLite `Job` table — there is **no
separate broker**. The worker (and the in-process embedded poller) treat the
database as the single source of truth:

1. Poll for the highest-priority `Job` with `status = 'QUEUED'`
   (`ORDER BY priority DESC, createdAt ASC`).
2. Atomically claim it with a compare-and-set: `updateMany({ where: { id,
   status: 'QUEUED' }, data: { status: 'PROCESSING', startedAt } })`. If
   `count === 0`, another poller won the race — skip and retry.
3. On boot, re-queue stalled `PROCESSING` jobs (older than the stale threshold)
   with the same atomic CAS guard, so no job is lost across restarts.

This logic lives in `src/lib/pipeline/job-runner.ts` (`claimNextJob`,
`rehydrateStalledJobs`, `executeJobWithRetry`) and is shared by both the
standalone worker (`mini-services/lemniscate-worker/index.ts`) and the embedded
poller (`src/lib/pipeline/embedded-poller.ts`). Retries use exponential backoff;
jobs that exhaust retries move to `DEAD_LETTER` and can be re-queued via
`POST /api/jobs/dead-letter`.

**Dead-letter recovery:** `GET /api/jobs/dead-letter` lists failed jobs.
`POST /api/jobs/dead-letter` with `{ jobId }` atomically moves the job back to
`QUEUED`.

> **Redis is not implemented.** `REDIS_URL` is reserved for a future
> Redis-backed queue + cross-process pub/sub. The current design is durable and
> restart-safe for single-node deployments without any external broker.

## 4. Pipeline Stages

```
EXTRACT → SEGMENT → ORIGINAL → CINEMATIFY → ANALYZE → FINALIZE → COMPLETED
   5%      20%        35%         65%         80%       95%       100%
```

Each stage:
1. Updates `Job.progress` + `Job.stage` in SQLite
2. Writes a `ProcessingLog` row
3. Publishes a `ProgressEvent` to the `EventBus`

The `EventBus` (`src/lib/events/bus.ts`) is an in-process pub/sub with a
200-event ring buffer per job (max 50 jobs tracked). It fans out to Socket.IO
clients subscribed to that `jobId`. Late-joiners receive the replayed history.

### Embedded poller vs. standalone worker

Two components can run the pipeline:

| Component | File | When active |
|---|---|---|
| Embedded poller | `src/lib/pipeline/embedded-poller.ts` | Default — started from `src/instrumentation.ts` when `DISABLE_EMBEDDED_WORKER` is unset |
| Standalone worker | `mini-services/lemniscate-worker/index.ts` | Docker Compose deployment — app sets `DISABLE_EMBEDDED_WORKER=1` |

Both use the same `job-runner.ts` CAS logic. Job claiming is atomic so they
cannot double-process the same job even if both run simultaneously.

## 5. Deterministic NLP — No AI

### 5.1 Sentence segmentation (`nlp/core.ts`)
- Terminator detection: `.!?` followed by whitespace + capital/quote
- **Guards**: abbreviation table (Mr, Dr, Inc, …), single-letter initials, decimals (`3.14`), numbered lists
- Smart-quote normalization

### 5.2 Character detection (`pipeline/cinematified.ts`)
- Honorific-prefixed names (`Mr. Darcy`, `Captain Ahab`)
- Attribution-verb co-occurrence (`said Elizabeth`, `Darcy replied`) — 30+ verbs
- Dialogue extraction with speaker attribution (look-back/look-ahead 60 chars)
- Capitalized proper-noun candidates (filtered by stop-words + sentence-start guard)
- Role classification by mention rank: Protagonist (top), Antagonist (2nd if ≥60% of max), Minor (<15% or rank >5)

### 5.3 Scene detection
A scene boundary fires when **any** of:
- A `HEADING` paragraph appears
- A `TRANSITION` paragraph appears (`Meanwhile`, `Later`, `The next day`, …)
- The dominant location changes between paragraphs
- A soft cap of 6 paragraphs accumulates (unless mid-dialogue)

Each scene is scored for:
- **Tension** (0–100): `(violence×4 + conflict×2 + intensifiers×1 + exclaims×2 + questions×1) / wordCount`, mapped to a 0–100 density scale
- **Emotion** (0–100, 50 = neutral): AFINN valence × negation/intensifier multipliers, clamped
- **Mood**: derived from tension + emotion + time-of-day

### 5.4 Narrative arcs
Scenes are split into 5 equal zones. Each zone's signal-word density is counted
against 5 lexicons (Inciting / Rising / Climax / Falling / Resolution). The
zone's arc type gets an intensity score from its matching lexicon.

### 5.5 Cinematic reconstruction
- Scene heading: derived from detected location type + time-of-day
- Dialogue blocks: speaker name (uppercase) + verbatim quote
- Action lines: verbatim source text
- Transition cues between scenes chosen by tension delta + location/time change

**Hard constraint**: every line of "story" text is sourced **verbatim** from the
input. Structural annotations (headings, cues) are generated; content is never
invented.

## 6. Data Model

See `prisma/schema.prisma`. Key entities:

| Model | Purpose |
|---|---|
| `Document` | Uploaded file metadata + hash (dedup) |
| `Job` | Processing job with status, progress, stage, duration |
| `RawText` | Extracted plain text + stats |
| `Narrative` | Transformed output (one per mode per document) |
| `Paragraph` | Classified paragraph (type, speaker, offsets) |
| `Scene` | Detected scene (location, time, mood, tension, emotion) |
| `Character` | Detected character (aliases, mentions, role, dialogue count) |
| `Location` | Detected location (type, mentions) |
| `Event` | Detected event (type, participants, intensity) |
| `NarrativeArc` | Arc segment (type, scene range, intensity) |
| `EmotionalPeak` | Peak (emotion, intensity, snippet) |
| `ProcessingLog` | Per-job stage logs (INFO/WARN/ERROR/DEBUG) |
| `ReadingProgress` | Per-narrative scroll position (scrollPct, sceneIndex, paragraphIdx) |
| `Bookmark` | Per-narrative bookmarks (offset, label, note) |

### 6.1 Database file location & initialization

The datasource is SQLite via `DATABASE_URL` (`file:` URL). Path resolution is
subtle and documented explicitly here:

- **Relative** `file:` paths (e.g. `file:./db/custom.db`) are resolved by
  Prisma 6 **relative to the `prisma/schema.prisma` directory**, for both the
  CLI and the generated client. So `file:./db/custom.db` run from the project
  root actually reads/writes `prisma/db/custom.db` — that is the canonical
  local/dev database.
- **Absolute** `file:` paths (e.g. `file:/app/db/custom.db`) are used verbatim.
  Production deployments use absolute paths to avoid the ambiguity above and to
  match the mounted data volume.

Initialization by deployment path:

- **Local / dev:** `bun run db:push` creates the schema at `prisma/db/custom.db`.
- **Docker Compose:** both `app` and `worker` use `DATABASE_URL=file:/app/db/custom.db`
  (absolute) mapped to the `db-data` volume. The image bakes a schema-only seed
  DB at `/app/db-seed/custom.db`; `docker-entrypoint.sh` copies it into the
  volume on first boot only (never overwriting existing data).

> There is **no migration history** yet (the project uses `db push`). Adding a
> versioned Prisma migration baseline + `migrate deploy` is a recommended
> follow-up for stricter production change control.

## 7. Frontend Architecture

Single-page app (`src/app/page.tsx`) with a Zustand store (`src/components/lemniscate/store.ts`) driving view state.

### Views (all lazy-loaded except landing)

| View | File | Purpose |
|---|---|---|
| `landing` | `views/landing.tsx` | Home / upload / sample trigger |
| `library` | `views/library.tsx` | Document list, search, filter |
| `processing` | `views/processing.tsx` | Live pipeline dashboard + log stream |
| `reader` | `views/reader.tsx` | Narrative viewer (Original + Cinematified) |
| `characters` | `views/characters.tsx` | Character graph + cast list |
| `scenes` | `views/scenes.tsx` | Scene timeline + tension curve |
| `settings` | `views/settings.tsx` | Reader preferences |

### Key hooks

- **`use-realtime.ts`** — Socket.IO hook; subscribes to active job IDs, replays
  history on connect, patches the Zustand `progress` map.
- **`use-worker-status.ts`** — lightweight probe of worker connectivity; used
  by the header to show Live/Poll badge.

### State layers

| Concern | Layer |
|---|---|
| Navigation, reader prefs, job progress | Zustand (`store.ts`) |
| Remote data (narratives, documents) | Direct `fetch` calls in components |
| Offline: reading position, bookmarks | Server-persisted via API routes |

## 8. API Routes

All routes are under `src/app/api/`.

| Route | Methods | Purpose |
|---|---|---|
| `/api/documents` | GET | List all documents |
| `/api/documents/upload` | POST | Upload file, create Document + Job |
| `/api/documents/[id]` | GET, DELETE | Document detail / delete (cascades) |
| `/api/documents/[id]/narratives` | GET | List narratives for a document |
| `/api/narratives/[id]` | GET | Full narrative + all artifacts (paginated) |
| `/api/narratives/[id]/export` | GET | Export as markdown / HTML (PDF-print) / EPUB |
| `/api/narratives/[id]/search` | GET | Full-text search within narrative |
| `/api/narratives/[id]/progress` | GET, POST | Reading progress (upsert) |
| `/api/narratives/[id]/bookmarks` | GET, POST, DELETE | Bookmarks |
| `/api/jobs/[id]` | GET | Job status (polling fallback) |
| `/api/jobs/[id]/logs` | GET | Processing log stream |
| `/api/jobs/dead-letter` | GET, POST | List / retry dead-letter jobs |
| `/api/reading-progress` | GET | All narratives with active reading progress |
| `/api/sample` | POST | Enqueue the built-in sample story |
| `/api/stats` | GET | Dashboard aggregates |
| `/api/health` | GET | Liveness + database connectivity check |

## 9. Deployment

### Minimal (sandbox / single-server)
- Next.js on port 3000 (embedded poller active — `DISABLE_EMBEDDED_WORKER` unset)
- Worker on port 3003 (optional — adds WebSocket realtime; HTTP polling works without it)
- SQLite at `prisma/db/custom.db` (relative dev path)

### Production (Docker Compose)
- Next.js app on 3000 (`DISABLE_EMBEDDED_WORKER=1`)
- Standalone worker on 3003
- SQLite at `/app/db/custom.db` on the `db-data` named volume (WAL mode)
- Caddy reverse proxy on port 81, routing WebSocket traffic by the
  `XTransformPort=3003` query parameter to the worker service

### Future (horizontal) — not yet implemented
Scaling beyond one node would require:
- Moving off SQLite to Postgres/Turso (Prisma supports swapping `datasource`)
- A Redis-backed queue (`REDIS_URL` reserved) so multiple workers coordinate
- Publishing `ProgressEvent`s to a `lemniscate:events` Redis pub/sub channel so
  multiple Socket.IO gateways can fan out

## 10. Security

- **API key auth** (`LEMNISCATE_API_KEY`): Bearer or `x-api-key` header. Required in production (enforced at startup); disabled by absence in dev.
- **CSRF protection** (`LEMNISCATE_ALLOWED_ORIGINS`): Origin/Referer checked on mutating requests. Optional in dev.
- **Rate limiting**: In-memory token bucket per IP per route. Ephemeral (resets on restart).
- **File validation**: MIME type + extension + magic bytes checked on every upload.
- **Filename sanitization**: Control characters, path traversal sequences stripped.
- **ID validation**: All path params validated against CUID/UUID patterns before DB access.
- **Body size limits**: 1MB cap on non-upload routes; 25MB cap on uploads.
- **Security headers**: `X-Frame-Options`, `X-Content-Type-Options`, CSP, HSTS set via `next.config.ts`.

## 11. Testing

Tests are co-located with the modules they test:

| File | Coverage |
|---|---|
| `src/lib/nlp/core.test.ts` | NLP primitives: tokenizer, sentence splitter, POS tagger, stats |
| `src/lib/pipeline/extract.test.ts` | Text extraction for PDF/DOCX/TXT |
| `src/lib/pipeline/original.test.ts` | Original mode transformer |
| `src/lib/pipeline/cinematified.test.ts` | Cinematified mode: scene/character/event/arc detection |
| `src/__e2e__/pipeline-e2e.test.ts` | End-to-end: upload → process → read (against real DB) |

Run with: `bun run test` (single pass) or `bun run test:watch`.

The E2E test (`pipeline-e2e.test.ts`) writes a human-readable transcript to
`e2e-report.txt` and requires a live database. Run explicitly:
```
npx vitest run src/__e2e__/pipeline-e2e.test.ts
```

## 12. Pluggable Provider Architecture

Lemniscate uses a dependency-injection provider registry so that every major
processing capability can be swapped via environment variables without touching
service or API code.

### Provider Interfaces

| Interface | Slot | Default | Env Var |
|---|---|---|---|
| `IDocumentParser` | `documentParser` | `deterministic` | `DOCUMENT_PARSER_PROVIDER` |
| `INarrativeAnalyzer` | `narrativeAnalyzer` | `deterministic` | `NARRATIVE_ANALYZER_PROVIDER` |
| `ICharacterAnalyzer` | `characterAnalyzer` | `deterministic` | `CHARACTER_ANALYZER_PROVIDER` |
| `IRelationshipAnalyzer` | `relationshipAnalyzer` | `deterministic` | `RELATIONSHIP_ANALYZER_PROVIDER` |
| `IEmbeddingProvider` | `embedding` | _(none — opt-in)_ | `EMBEDDING_PROVIDER` |
| `ISearchProvider` | `search` | `deterministic` | `SEARCH_PROVIDER` |
| `IStorageProvider` | `storage` | `local` | `STORAGE_PROVIDER` |
| `IQueueProvider` | `queue` | `sqlite` | `QUEUE_PROVIDER` |

To add a new provider (e.g. an OpenAI embedding provider):
1. Create the implementation in `src/lib/providers/implementations/`.
2. Import it in `src/lib/providers/index.ts` and call `registerProvider()`.
3. Users select it via the corresponding environment variable.

This modular design supports deterministic algorithms today and cloud AI
providers tomorrow — all behind stable interfaces.

## 13. Relationship Engine

The Relationship Engine (`src/lib/nlp/relationships.ts`) builds a deterministic
social graph from co-occurrence and dialogue interaction data.

### Pipeline

1. **Edge construction** — characters sharing a scene get a co-occurrence edge;
   sequential dialogue turns (within a 2-line window) get dialogue interaction
   counts.
2. **Strength scoring** — composite `[0..100]` from co-occurrence (60%) and
   dialogue interactions (40%), normalized to the graph's maximum.
3. **Centrality metrics**:
   - **Degree centrality** — connections / (n-1)
   - **Betweenness centrality** — Brandes' algorithm for shortest-path bridging
   - **Closeness centrality** — harmonic mean of shortest distances
4. **Community detection** — deterministic label propagation; each community
   reports a `cohesion` score (internal edge density).

All algorithms are deterministic: identical input produces byte-identical output.

### API

| Route | Method | Purpose |
|---|---|---|
| `/api/v1/narratives/:id/relationships` | GET | Relationship graph |

## 14. Service Layer

| Service | File | Responsibility |
|---|---|---|
| Document Service | `document.service.ts` | Upload, list, get, delete |
| Narrative Service | `narrative.service.ts` | Narrative detail, reading progress, bookmarks |
| Job Service | `job.service.ts` | Job status, logs, dead-letter, health |
| Search Service | `search.service.ts` | Full-text search within narratives |
| Analytics Service | `analytics.service.ts` | Dashboard aggregates |
| Processing Service | `processing.service.ts` | Pipeline orchestration, cancel, re-prioritize |
| Export Service | `export.service.ts` | Markdown/HTML/EPUB/JSON export |
| Notification Service | `notification.service.ts` | Event fan-out (EventBus to WebSocket) |
| Auth Service | `auth.service.ts` | Authentication + CSRF validation |
| Relationship Service | `relationship.service.ts` | Relationship graph generation |

## 15. Versioned API (v1)

All new endpoints are under `/api/v1/` and use the standard response envelope.
OpenAPI 3.1 spec is available at `/api/v1/openapi.json`.
