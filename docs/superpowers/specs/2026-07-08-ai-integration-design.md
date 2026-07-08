# AI Integration Design

**Date**: 2026-07-08
**Status**: Approved
**Branch**: v0

## Overview

Add OpenAI-compatible AI providers alongside existing deterministic NLP. Both paths coexist. User configures AI via UI settings — API keys, base URL, model selection per pipeline stage. AI handles post-extract stages (SEGMENT → ORIGINAL → CINEMATIFY → ANALYZE → FINALIZE). EXTRACT stays deterministic.

## Architecture

```
src/lib/ai/
  client.ts          — OpenAI-compatible HTTP client (fetch wrapper, retry, timeout)
  key-store.ts       — encrypt/decrypt API keys (AES-256-GCM, key from LEMNISCATE_ENCRYPTION_KEY)
  config.ts          — read per-stage model config from DB
  service.ts         — AIService: combines client + key + config, exposes chat(messages, stage)
  prompts/
    narrative.ts     — system prompts for scene detection, arcs, emotion timeline
    characters.ts    — system prompts for character extraction + analysis
    relationships.ts — system prompts for relationship graph
```

### AI Service Layer

`AIService.chat()` flow:
1. Read encrypted key from DB
2. Decrypt in memory (never logged, never returned to client)
3. Call OpenAI-compatible endpoint with configurable `baseURL`, `apiKey`, `model`, `temperature`, `maxTokens`
4. Return structured JSON (JSON Schema in prompt, no function calling needed for initial version)
5. Provider parses into domain types

### Provider Implementations

Three new implementations in `src/lib/providers/implementations/`:

| Implementation | Interface | Registered As |
|---|---|---|
| `OpenAINarrativeAnalyzer` | `INarrativeAnalyzer` | `openai` |
| `OpenAICharacterAnalyzer` | `ICharacterAnalyzer` | `openai` |
| `OpenAIRelationshipAnalyzer` | `IRelationshipAnalyzer` | `openai` |

Each delegates to `AIService`, parses structured JSON into existing domain types. Registered alongside deterministic implementations — user selects via env var or UI toggle.

### Prompt Strategy

Prompts live in `src/lib/ai/prompts/` as versioned templates. Each sends raw text + structured instructions → expects JSON matching existing result types. Prompts are testable (unit tests with mock responses).

### Fallback

AI call failure (timeout, rate limit, bad response) → log warning → fall back to deterministic for that stage. Never block the pipeline. Dead-letter only if both fail.

## Database Schema

### AIConfig

| Column | Type | Notes |
|---|---|---|
| id | String (PK) | Single row (singleton config) |
| provider | String | `openai-compatible` |
| baseUrl | String | e.g. `https://api.openai.com/v1` |
| apiKeyEncrypted | String | AES-256-GCM encrypted |
| defaultModel | String | e.g. `gpt-4o` |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### AIStageConfig

| Column | Type | Notes |
|---|---|---|
| id | String (PK) | |
| stage | String | segment / original / cinematify / analyze / finalize |
| model | String? | Null = use AIConfig.defaultModel |
| temperature | Float? | |
| maxTokens | Int? | |
| enabled | Boolean | Default true |

### AICost (optional, for tracking)

| Column | Type | Notes |
|---|---|---|
| id | String (PK) | |
| jobId | String (FK → Job) | |
| stage | String | |
| model | String | |
| promptTokens | Int | |
| completionTokens | Int | |
| estimatedCost | Float | |
| latencyMs | Int | |
| createdAt | DateTime | |

## API Routes

All under `/api/v1/`:

| Method | Path | Description |
|---|---|---|
| GET | `/ai/config` | Return config (key omitted) |
| PUT | `/ai/config` | Upsert base URL, default model, stage overrides |
| POST | `/ai/key` | Set/rotate API key |
| DELETE | `/ai/key` | Remove key |
| POST | `/ai/test` | Test connection with current config |

## UI

New "AI" tab in settings view (`src/components/lemniscate/views/settings.tsx`):

- Base URL input
- API key input (masked, show/hide toggle)
- Default model input
- Per-stage model override dropdowns (segment, original, cinematify, analyze, finalize)
- Per-stage enable/disable toggles
- "Test Connection" button
- Global AI enable/disable toggle

## Pipeline Integration

No pipeline code changes needed. Provider swap is transparent:

1. `registerDefaultProviders()` registers both `deterministic` and `openai` for each slot
2. When env var or UI config selects `openai`, `resolveProvider` returns AI implementation
3. Pipeline reads `AIStageConfig` at job start — allows mixed pipelines (AI cinematify + deterministic segment)
4. AI stages emit same `ProgressEvent` types with additional metadata (model, tokens, latency)
5. AI failures fall back to deterministic

## Security

- API keys encrypted at rest (AES-256-GCM)
- `LEMNISCATE_ENCRYPTION_KEY` env var required when AI mode enabled (≥32 chars)
- Keys never logged, never returned to client
- Existing API key auth (`LEMNISCATE_API_KEY`) still enforced on all routes
- AI config routes protected by existing security middleware

## Constraints Preserved

- Verbatim text constraint: AI generates structural annotations only, never invents story content
- EXTRACT stays deterministic (binary parsing)
- Both output modes (ORIGINAL, CINEMATIFIED) still available
- Deterministic path remains default; AI is opt-in
