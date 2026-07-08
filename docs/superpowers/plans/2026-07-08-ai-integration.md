# AI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OpenAI-compatible AI providers alongside existing deterministic NLP, with UI-driven configuration and per-stage model selection.

**Architecture:** New `src/lib/ai/` service layer (client, key-store, config, service, prompts) that AI provider implementations delegate to. Providers implement existing interfaces (`INarrativeAnalyzer`, `ICharacterAnalyzer`, `IRelationshipAnalyzer`) and register alongside deterministic ones. Pipeline orchestrator resolves providers at runtime, falling back to deterministic on AI failure. API key encrypted at rest with AES-256-GCM.

**Tech Stack:** TypeScript, Prisma/SQLite, Next.js API routes, React/Zustand, shadcn/ui, OpenAI-compatible HTTP API

## Global Constraints

- Verbatim text constraint: AI generates structural annotations only, never invents story content
- EXTRACT stays deterministic (binary parsing)
- Both output modes (ORIGINAL, CINEMATIFIED) still available
- Deterministic path remains default; AI is opt-in
- API keys encrypted at rest (AES-256-GCM), never logged, never returned to client
- `LEMNISCATE_ENCRYPTION_KEY` env var required when AI mode enabled (≥32 chars)
- Existing API key auth (`LEMNISCATE_API_KEY`) still enforced on all routes
- All new API routes under `/api/v1/`

---

## File Structure

```
src/lib/ai/
  client.ts              — OpenAI-compatible HTTP client (fetch, retry, timeout)
  key-store.ts            — AES-256-GCM encrypt/decrypt for API keys
  config.ts               — read/write AIConfig + AIStageConfig from DB
  service.ts              — AIService: combines client + key + config
  prompts/
    narrative.ts          — system prompt for scene/arc/emotion detection
    characters.ts         — system prompt for character extraction
    relationships.ts      — system prompt for relationship graph

src/lib/providers/implementations/
  openai-narrative-analyzer.ts
  openai-character-analyzer.ts
  openai-relationship-analyzer.ts

src/app/api/v1/ai/
  config/route.ts         — GET + PUT /api/v1/ai/config
  key/route.ts            — POST + DELETE /api/v1/ai/key
  test/route.ts           — POST /api/v1/ai/test

src/lib/services/
  ai-config.service.ts    — business logic for AI config CRUD + test
```

## Key Design Decisions

1. **Orchestrator currently bypasses providers.** `orchestrator.ts` calls `transformCinematified()` directly, not `getNarrativeAnalyzer()`. Task 11 wires the orchestrator to the provider registry so AI providers can be swapped in. The deterministic path stays identical — the provider just wraps the same `transformCinematified` call.

2. **Provider resolution at job start, not per-request.** The orchestrator reads `AIStageConfig` once when a job begins. If AI is enabled for a stage, it resolves the `openai` provider. If the AI call fails, it falls back to deterministic inline. No runtime switching mid-job.

3. **AI key never touches the client.** `GET /api/v1/ai/config` returns config with the key field omitted. `POST /api/v1/ai/key` accepts the key, encrypts it, stores it. The key is only decrypted in-memory at API call time inside `AIService`.

4. **Prompts are TypeScript modules, not text files.** Each prompt exports a function that builds a messages array from input data. This keeps prompts versioned, testable, and type-safe — no string templates floating in config.

---

### Task 1: Prisma schema — add AIConfig, AIStageConfig, AICost

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `AIConfig`, `AIStageConfig`, `AICost` Prisma models available to all downstream tasks

- [ ] **Step 1: Add models to Prisma schema**

Add these models after the `Bookmark` model at the end of `prisma/schema.prisma`:

```prisma
// ---------------------------------------------------------------------------
// AI configuration
// ---------------------------------------------------------------------------

model AIConfig {
  id               String   @id @default("default")
  provider         String   @default("openai-compatible")
  baseUrl          String   @default("https://api.openai.com/v1")
  apiKeyEncrypted  String?
  defaultModel     String   @default("gpt-4o")
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}

model AIStageConfig {
  id          String   @id @default(cuid())
  stage       String   // segment | original | cinematify | analyze | finalize
  model       String?
  temperature Float?
  maxTokens   Int?
  enabled     Boolean  @default(true)

  @@unique([stage])
}

model AICost {
  id               String   @id @default(cuid())
  jobId            String
  stage            String
  model            String
  promptTokens     Int      @default(0)
  completionTokens Int      @default(0)
  estimatedCost    Float    @default(0)
  latencyMs        Int      @default(0)
  createdAt        DateTime @default(now())
}
```

- [ ] **Step 2: Push schema to SQLite**

```bash
bun run db:push
```

Expected: "Your database is now in sync with your schema."

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add AIConfig, AIStageConfig, and AICost models to Prisma schema"
```

---

### Task 2: AI key-store — AES-256-GCM encrypt/decrypt

**Files:**
- Create: `src/lib/ai/key-store.ts`

**Interfaces:**
- Produces: `encryptApiKey(plaintext: string): Promise<string>`, `decryptApiKey(ciphertext: string): Promise<string>`

- [ ] **Step 1: Create key-store module**

Create `src/lib/ai/key-store.ts`:

```ts
/**
 * Lemniscate — AI Key Store
 * ----------------------------------------------------------------------------
 * AES-256-GCM encryption for API keys at rest.
 * Encryption key derived from LEMNISCATE_ENCRYPTION_KEY env var via SHA-256.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const ENCRYPTION_KEY = process.env.LEMNISCATE_ENCRYPTION_KEY

function getKey(): Buffer {
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
    throw new Error(
      'LEMNISCATE_ENCRYPTION_KEY must be set (≥32 chars) to use AI features.',
    )
  }
  // Derive a 32-byte key using scrypt for key stretching
  return scryptSync(ENCRYPTION_KEY, 'lemniscate-ai-salt', 32)
}

const ALGORITHM = 'aes-256-gcm'

export async function encryptApiKey(plaintext: string): Promise<string> {
  const key = getKey()
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()

  // Format: iv:authTag:ciphertext (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

export async function decryptApiKey(ciphertext: string): Promise<string> {
  const key = getKey()
  const [ivHex, authTagHex, encrypted] = ciphertext.split(':')

  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error('Invalid encrypted key format')
  }

  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
```

- [ ] **Step 2: Verify module compiles**

```bash
npx tsc --noEmit src/lib/ai/key-store.ts 2>&1 | head -5
```

Expected: no errors (may show unrelated project errors — ignore those, focus on key-store.ts errors only).

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/key-store.ts
git commit -m "feat: add AES-256-GCM key store for AI API key encryption"
```

---

### Task 3: Environment validation — add LEMNISCATE_ENCRYPTION_KEY rule

**Files:**
- Modify: `src/lib/env-validation.ts`

**Interfaces:**
- Consumes: `ENV_RULES` array
- Produces: `LEMNISCATE_ENCRYPTION_KEY` validated at startup (warn in dev, fatal in production when AI features used)

- [ ] **Step 1: Add encryption key rule**

In `src/lib/env-validation.ts`, add to the `ENV_RULES` array after the `LEMNISCATE_ALLOWED_ORIGINS` entry:

```ts
{
  name: 'LEMNISCATE_ENCRYPTION_KEY',
  required: 'production',
  description: 'Encryption key for AI API keys at rest. Must be ≥32 characters.',
  validate: (v) => v.length >= 32,
},
```

The full `ENV_RULES` array should now be:

```ts
const ENV_RULES: EnvRule[] = [
  {
    name: 'DATABASE_URL',
    required: 'always',
    description: 'SQLite database file path (e.g., file:./db/custom.db)',
    validate: (v) => v.startsWith('file:'),
  },
  {
    name: 'LEMNISCATE_API_KEY',
    required: 'production',
    description: 'API key for authenticated access. Must be set in production.',
    validate: (v) => v.length >= 16,
  },
  {
    name: 'LEMNISCATE_ALLOWED_ORIGINS',
    required: 'production',
    description: 'Comma-separated list of allowed origins for CORS/CSRF (e.g., https://app.example.com)',
  },
  {
    name: 'LEMNISCATE_ENCRYPTION_KEY',
    required: 'production',
    description: 'Encryption key for AI API keys at rest. Must be ≥32 characters.',
    validate: (v) => v.length >= 32,
  },
]
```

- [ ] **Step 2: Verify validation logic**

```bash
npx tsc --noEmit 2>&1 | grep -i "env-validation" | head -5
```

Expected: no errors in env-validation.ts.

- [ ] **Step 3: Commit**

```bash
git add src/lib/env-validation.ts
git commit -m "feat: add LEMNISCATE_ENCRYPTION_KEY validation rule"
```

---

### Task 4: AI HTTP client — OpenAI-compatible fetch wrapper

**Files:**
- Create: `src/lib/ai/client.ts`

**Interfaces:**
- Produces: `AIClient` class with `chat(messages, options): Promise<AIChatResponse>`
- Produces: `AIChatResponse` type with `{ content: string, model: string, usage?: { promptTokens, completionTokens } }`

- [ ] **Step 1: Create AI client module**

Create `src/lib/ai/client.ts`:

```ts
/**
 * Lemniscate — AI HTTP Client
 * ----------------------------------------------------------------------------
 * Minimal OpenAI-compatible chat completions client.
 * Supports configurable base URL, retry on 429/5xx, and timeout.
 */

export interface AIChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AIChatOptions {
  model: string
  temperature?: number
  maxTokens?: number
  baseUrl: string
  apiKey: string
  timeoutMs?: number
  maxRetries?: number
}

export interface AIChatResponse {
  content: string
  model: string
  usage?: {
    promptTokens: number
    completionTokens: number
  }
}

export class AIClient {
  async chat(
    messages: AIChatMessage[],
    options: AIChatOptions,
  ): Promise<AIChatResponse> {
    const timeoutMs = options.timeoutMs ?? 120_000
    const maxRetries = options.maxRetries ?? 2

    const body = JSON.stringify({
      model: options.model,
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 4096,
    })

    const url = `${options.baseUrl.replace(/\/$/, '')}/chat/completions`

    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${options.apiKey}`,
          },
          body,
          signal: controller.signal,
        })

        clearTimeout(timer)

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error')
          const status = response.status

          // Retry on rate limits and server errors
          if ((status === 429 || status >= 500) && attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 8000)
            await new Promise((r) => setTimeout(r, delay))
            continue
          }

          throw new Error(
            `AI API error ${status}: ${errorText.slice(0, 500)}`,
          )
        }

        const data = await response.json()
        const choice = data.choices?.[0]

        if (!choice?.message?.content) {
          throw new Error(
            `AI API returned no content. Finish reason: ${choice?.finish_reason ?? 'unknown'}`,
          )
        }

        return {
          content: choice.message.content,
          model: data.model ?? options.model,
          usage: data.usage
            ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
              }
            : undefined,
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))

        // Don't retry on abort/timeout
        if (lastError.name === 'AbortError') {
          throw new Error(`AI API request timed out after ${timeoutMs}ms`)
        }

        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 8000)
          await new Promise((r) => setTimeout(r, delay))
        }
      }
    }

    throw lastError ?? new Error('AI API request failed')
  }
}

/** Default singleton instance. */
export const aiClient = new AIClient()
```

- [ ] **Step 2: Verify module compiles**

```bash
npx tsc --noEmit 2>&1 | grep "src/lib/ai/client" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/client.ts
git commit -m "feat: add OpenAI-compatible HTTP client with retry logic"
```

---

### Task 5: AI config repository — read/write config from DB

**Files:**
- Create: `src/lib/ai/config.ts`

**Interfaces:**
- Produces: `getAIConfig(): Promise<AIConfigRow | null>`, `upsertAIConfig(data): Promise<AIConfigRow>`, `getStageConfig(stage): Promise<AIStageConfigRow | null>`, `getAllStageConfigs(): Promise<AIStageConfigRow[]>`, `upsertStageConfig(stage, data): Promise<AIStageConfigRow>`

- [ ] **Step 1: Create config module**

Create `src/lib/ai/config.ts`:

```ts
/**
 * Lemniscate — AI Config Repository
 * ----------------------------------------------------------------------------
 * Reads and writes AI configuration from the database.
 * AIConfig is a singleton row (id = "default").
 * AIStageConfig has one row per pipeline stage.
 */

import { db } from '@/lib/db'

export interface AIConfigRow {
  id: string
  provider: string
  baseUrl: string
  apiKeyEncrypted: string | null
  defaultModel: string
}

export interface AIStageConfigRow {
  id: string
  stage: string
  model: string | null
  temperature: number | null
  maxTokens: number | null
  enabled: boolean
}

export interface AIConfigInput {
  provider?: string
  baseUrl?: string
  defaultModel?: string
}

export interface AIStageConfigInput {
  model?: string | null
  temperature?: number | null
  maxTokens?: number | null
  enabled?: boolean
}

// ─── Global config ─────────────────────────────────────────────────────────

export async function getAIConfig(): Promise<AIConfigRow | null> {
  return db.aIConfig.findUnique({ where: { id: 'default' } }) as unknown as AIConfigRow | null
}

export async function upsertAIConfig(data: AIConfigInput): Promise<AIConfigRow> {
  return db.aIConfig.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      provider: data.provider ?? 'openai-compatible',
      baseUrl: data.baseUrl ?? 'https://api.openai.com/v1',
      defaultModel: data.defaultModel ?? 'gpt-4o',
    },
    update: {
      ...(data.provider !== undefined && { provider: data.provider }),
      ...(data.baseUrl !== undefined && { baseUrl: data.baseUrl }),
      ...(data.defaultModel !== undefined && { defaultModel: data.defaultModel }),
    },
  }) as unknown as AIConfigRow
}

// ─── Per-stage config ──────────────────────────────────────────────────────

const VALID_STAGES = ['segment', 'original', 'cinematify', 'analyze', 'finalize']

export async function getStageConfig(stage: string): Promise<AIStageConfigRow | null> {
  return db.aIStageConfig.findUnique({ where: { stage } }) as unknown as AIStageConfigRow | null
}

export async function getAllStageConfigs(): Promise<AIStageConfigRow[]> {
  return db.aIStageConfig.findMany() as unknown as AIStageConfigRow[]
}

export async function upsertStageConfig(
  stage: string,
  data: AIStageConfigInput,
): Promise<AIStageConfigRow> {
  if (!VALID_STAGES.includes(stage)) {
    throw new Error(`Invalid stage: ${stage}. Must be one of: ${VALID_STAGES.join(', ')}`)
  }

  return db.aIStageConfig.upsert({
    where: { stage },
    create: {
      stage,
      model: data.model ?? null,
      temperature: data.temperature ?? null,
      maxTokens: data.maxTokens ?? null,
      enabled: data.enabled ?? true,
    },
    update: {
      ...(data.model !== undefined && { model: data.model }),
      ...(data.temperature !== undefined && { temperature: data.temperature }),
      ...(data.maxTokens !== undefined && { maxTokens: data.maxTokens }),
      ...(data.enabled !== undefined && { enabled: data.enabled }),
    },
  }) as unknown as AIStageConfigRow
}

// ─── Resolve effective config for a stage ──────────────────────────────────

export interface EffectiveStageConfig {
  enabled: boolean
  model: string
  temperature: number
  maxTokens: number
  baseUrl: string
}

/**
 * Resolve the effective config for a pipeline stage.
 * Stage config overrides global config; global config provides defaults.
 * Returns null if AI is not configured (no global config or no key set).
 */
export async function resolveStageConfig(stage: string): Promise<EffectiveStageConfig | null> {
  const global = await getAIConfig()
  if (!global || !global.apiKeyEncrypted) return null

  const stageConfig = await getStageConfig(stage)

  return {
    enabled: stageConfig?.enabled ?? true,
    model: stageConfig?.model ?? global.defaultModel,
    temperature: stageConfig?.temperature ?? 0.3,
    maxTokens: stageConfig?.maxTokens ?? 4096,
    baseUrl: global.baseUrl,
  }
}
```

- [ ] **Step 2: Verify module compiles**

```bash
npx tsc --noEmit 2>&1 | grep "src/lib/ai/config" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/config.ts
git commit -m "feat: add AI config repository for DB-backed configuration"
```

---

### Task 6: AI service — combines client + key-store + config

**Files:**
- Create: `src/lib/ai/service.ts`

**Interfaces:**
- Consumes: `AIClient` from `./client`, `decryptApiKey` from `./key-store`, `resolveStageConfig` from `./config`
- Produces: `AIService` class with `chat(messages, stage): Promise<AIChatResponse>`

- [ ] **Step 1: Create AI service module**

Create `src/lib/ai/service.ts`:

```ts
/**
 * Lemniscate — AI Service
 * ----------------------------------------------------------------------------
 * Combines the HTTP client, encrypted key store, and per-stage config
 * into a single entry point for AI provider implementations.
 *
 * Usage:
 *   const ai = new AIService()
 *   const response = await ai.chat(messages, 'cinematify')
 */

import { AIClient, aiClient, type AIChatMessage, type AIChatResponse } from './client'
import { decryptApiKey } from './key-store'
import { resolveStageConfig, getAIConfig } from './config'
import { createLogger } from '@/lib/logger'

const logger = createLogger('ai-service')

export class AIService {
  private client: AIClient

  constructor(client?: AIClient) {
    this.client = client ?? aiClient
  }

  /**
   * Send a chat completion request for a specific pipeline stage.
   * Reads config from DB, decrypts the API key in-memory, and calls the API.
   */
  async chat(
    messages: AIChatMessage[],
    stage: string,
  ): Promise<AIChatResponse> {
    const stageConfig = await resolveStageConfig(stage)
    if (!stageConfig) {
      throw new Error(
        'AI is not configured. Set up your API key in Settings → AI.',
      )
    }

    if (!stageConfig.enabled) {
      throw new Error(`AI is disabled for stage "${stage}".`)
    }

    const globalConfig = await getAIConfig()
    if (!globalConfig?.apiKeyEncrypted) {
      throw new Error('No API key configured. Add your key in Settings → AI.')
    }

    const apiKey = await decryptApiKey(globalConfig.apiKeyEncrypted)

    logger.info('AI chat request', {
      stage,
      model: stageConfig.model,
      baseUrl: stageConfig.baseUrl.replace(/\/\/.*@/, '//***@'), // redact credentials in URL
    })

    const startTime = Date.now()

    try {
      const response = await this.client.chat(messages, {
        model: stageConfig.model,
        temperature: stageConfig.temperature,
        maxTokens: stageConfig.maxTokens,
        baseUrl: stageConfig.baseUrl,
        apiKey,
      })

      logger.info('AI chat response', {
        stage,
        model: response.model,
        latencyMs: Date.now() - startTime,
        usage: response.usage,
      })

      return response
    } catch (err) {
      logger.error('AI chat failed', {
        stage,
        model: stageConfig.model,
        latencyMs: Date.now() - startTime,
        error: (err as Error).message,
      })
      throw err
    }
  }
}

/** Default singleton instance. */
export const aiService = new AIService()
```

- [ ] **Step 2: Verify module compiles**

```bash
npx tsc --noEmit 2>&1 | grep "src/lib/ai/service" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/service.ts
git commit -m "feat: add AI service combining client, key store, and config"
```
