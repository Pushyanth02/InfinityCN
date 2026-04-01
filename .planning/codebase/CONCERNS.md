# System Concerns: InfinityCN
## Technical Debt & Growth Risks

**Analysis Date:** 2026-03-30
**Priority:** High

---

## 🚦 Hybrid Stack Complexity
The Node.js and .NET 9.0 hybrid solution requires significant coordination through RabbitMQ. This adds a layer of complexity for debugging and local development setup.
- **Risk:** Divergence in data serialization models between Node (TypeScript) and .NET (C#).
- **Mitigation:** Unified schema definitions and thorough integration tests in `.NET`.

## 🏗️ Performance at Scale
Cinematifying 100K+ word novels is resource-intensive. Current processing might lag under heavy concurrent user load.
- **Risk:** Job queue backlog or memory exhaustion during scene segmentation.
- **Mitigation:** Horizontal scaling of workers and scene-based chunk processing.

## 🌩️ AI Reliability
Deterministic output from LLMs is not guaranteed.
- **Risk:** AI returning malformed JSON or modifying story meaning during "cinematization."
- **Mitigation:** Strict schema enforcement and retry logic with offline fallback (`Transformers.js`).

## 💾 Offline Sync
Synchronizing deep reading progress and processed book data reliably between multiple IndexedDB instances and the Redis cloud state.
- **Risk:** Race conditions during progress updates.
- **Mitigation:** Optimistic UI updates with background synchronization.

---
*Concerns audit: 2026-03-30*
