# AI Integration Guide

## Overview

InfinityCN supports 7 AI providers for enhanced character analysis and narrative understanding. The AI system is designed with offline-first principles — all core features work without AI, while AI enhancement is optional and additive.

## Supported Providers

| Provider | Model | Best For | Latency | Cost |
|----------|-------|----------|---------|------|
| **Chrome AI** | Gemini Nano | Privacy, offline | ~500ms | Free |
| **Gemini** | gemini-2.5-flash | Balance | ~1-2s | Low |
| **OpenAI** | gpt-4o-mini | Quality | ~2-3s | Medium |
| **Anthropic** | claude-3.5-sonnet | Quality | ~2-3s | Medium |
| **Groq** | llama-3.3-70b | Speed | ~200ms | Low |
| **DeepSeek** | deepseek-chat | Cost | ~1-2s | Very Low |
| **Ollama** | llama3 (configurable) | Privacy, self-hosted | Varies | Free |

## Configuration

### Client-Side (Browser)

API keys are configured through the in-app AI Settings panel:

1. Click the **AI Settings** button (sparkle icon) in the header
2. Select your preferred provider
3. Enter your API key
4. Test the connection

Keys are stored in browser localStorage and never transmitted to our servers.

### Server Proxy (Optional)

For shared deployments where you don't want to expose API keys to users:

```bash
# Set environment variables
export GEMINI_API_KEY=your-key
export OPENAI_API_KEY=your-key
export ANTHROPIC_API_KEY=your-key
export GROQ_API_KEY=your-key
export DEEPSEEK_API_KEY=your-key

# Start the proxy
npx tsx server/proxy.ts
```

Then set `VITE_API_PROXY_URL=http://localhost:3001` in your environment.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        AI Client (ai.ts)                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Rate Limiter│  │   Cache     │  │  Request Dedup      │  │
│  │ (Token Bucket) │ (LRU + TTL) │  │  (In-flight Map)    │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Provider Router (callAI)                │    │
│  │  ┌─────────┐ ┌────────┐ ┌──────────┐ ┌──────────┐   │    │
│  │  │ chrome  │ │ gemini │ │ openai   │ │anthropic │   │    │
│  │  └─────────┘ └────────┘ └──────────┘ └──────────┘   │    │
│  │  ┌─────────┐ ┌────────┐ ┌──────────┐               │    │
│  │  │  groq   │ │deepseek│ │ ollama   │               │    │
│  │  └─────────┘ └────────┘ └──────────┘               │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Performance Optimizations

### 1. Request Deduplication

Identical requests made while one is in-flight return the same Promise:

```typescript
// In ai.ts
const inflightRequests = new Map<string, Promise<string>>();

// Check for inflight request with same key
if (inflightRequests.has(cacheKey)) {
  return inflightRequests.get(cacheKey)!;
}
```

### 2. LRU Cache with TTL

Responses are cached for 30 minutes:

```typescript
const MAX_CACHE_SIZE = 50;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
```

### 3. Token Bucket Rate Limiting

Prevents hitting provider rate limits:

```typescript
const MODEL_PRESETS = {
  gemini: { rateLimitRPM: 15 },
  openai: { rateLimitRPM: 60 },
  groq:   { rateLimitRPM: 30 },
  // ...
};
```

### 4. Exponential Backoff Retry

Automatic retry with classified errors:

```typescript
// Error types: rate_limit, auth, network, timeout, model_unavailable, unknown
// Only retryable errors trigger retry
// Exponential backoff: 1.5s → 3s → 6s
```

## AI Features

### Character Enhancement

The `enhanceCharacters` function combines algorithmic NER with AI enrichment:

```typescript
// 1. Extract characters algorithmically (fast, always works)
const algoStats = extractCharacters(text, 20);

// 2. If AI is enabled, enrich with descriptions
if (config.provider !== 'none') {
  const aiDescriptions = await callAI(prompt, config);
  // Merge AI descriptions with algorithmic stats
}
```

### Fallback Strategy

AI calls always have algorithmic fallbacks:

| Feature | AI Provider | Fallback |
|---------|-------------|----------|
| Character Codex | AI descriptions | NER extraction |
| Recap | AI summary | TextRank extractive |
| Atmosphere | AI analysis | Keyword scoring |

## Best Practices

### 1. Use Appropriate Models

- **Character-heavy texts**: Use Claude or GPT-4o for nuanced descriptions
- **Speed-critical**: Use Groq for fastest inference
- **Privacy-sensitive**: Use Chrome AI or Ollama

### 2. Optimize Prompts

Current prompts are optimized for:
- Minimal token usage (800 max output)
- JSON-only output (structured, parseable)
- Clear instructions (reduces hallucination)

### 3. Monitor Costs

Track usage through provider dashboards. Typical costs:
- ~100 character analyses: $0.05-0.10 (OpenAI/Anthropic)
- ~100 character analyses: $0.01-0.02 (Gemini/Groq)

## Troubleshooting

### "Rate limit exceeded"

- Solution: Wait a few seconds, the rate limiter will release tokens
- Check: Your provider plan's rate limits

### "API key is not set"

- Solution: Open AI Settings and enter your key
- Check: Key is correctly formatted (no extra spaces)

### "Empty response from provider"

- Solution: Check provider status, try different model
- Check: Your prompt isn't triggering safety filters

### Chrome AI not available

- Solution: Enable in `chrome://flags/#optimization-guide-on-device-model`
- Requirement: Chrome 127+ on supported platforms

## Provider-Specific Notes

### Anthropic (Claude)

Requires special header for direct browser access:
```typescript
'anthropic-dangerous-direct-browser-access': 'true'
```

### Gemini

Supports search grounding for real-time information:
```typescript
tools: config.useSearchGrounding ? [{ google_search: {} }] : undefined
```

### Ollama

Connect to local Ollama instance:
```typescript
ollamaUrl: 'http://localhost:11434'
ollamaModel: 'llama3' // or any installed model
```
