# System Integrations: InfinityCN
## Core Connectivity Map

**Analysis Date:** 2026-03-30
**Environment:** Hybrid Local/Cloud System

---

## 🌩️ AI Processing Integrations
- **Primary Model:** Anthropic (Sonnet) & OpenAI (GPT-4o) for high-reasoning cinematification.
- **Provider Proxy:** Node.js `server/src/services/aiProxy` handles secure routing and billing limits.
- **Secondary Routing:** `.NET Core Engine` handles specific document-heavy AI tasks.
- **Offline ML:** `Transformers.js` is the fallback when cloud services are unreachable.

## 📦 Data persistence Integrations
- **Cloud Database:** Redis for session state, user progress sync, and active scene caching.
- **Local Database:** Dexie (IndexedDB) for browser-resident book data, ensuring the "offline-first" experience.
- **Backup:** S3-compatible storage for raw source document archiving.

## 🏗️ Message & Queuing Integrations
- **RabbitMQ:** Orchestrates decoupling between the Node.js API and the .NET cinematization workers.
- **WebSockets:** Real-time push of cinematification progress to the React frontend.

## 🎨 Asset Integrations
- **Iconography:** Lucide React.
- **Media:** Public CDN for sound effects (SFX) and ambient music layers.

---
*Integration audit: 2026-03-30*
