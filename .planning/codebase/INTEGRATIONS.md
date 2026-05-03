# External Integrations

**Analysis Date:** 2026-05-03

## APIs & External Services

**Backend-as-a-Service:**
- Appwrite - Cloud sync and backend client
  - SDK/Client: `appwrite`
  - Location: `src/lib/runtime/appwrite.ts`

**Analytics:**
- Vercel Analytics & SpeedInsights - User metrics
  - SDK/Client: `@vercel/analytics`, `@vercel/speed-insights`
  - Instantiated dynamically in `src/main.tsx`

## Data Storage

**Databases:**
- Dexie (IndexedDB Wrapper) - Local storage execution
  - Client: `dexie`

**File Storage:**
- Virtual Filesystem via browser APIs (loading files into Local Memory / Blob URLs)

**Caching:**
- ServiceWorker via VitePWA (`vite.config.ts`) handles offline capability and font caching (Google fonts, gstatic).

## Authentication & Identity

**Auth Provider:**
- Unspecified globally, largely anonymous or leveraging Appwrite.

## Monitoring & Observability

**Error Tracking:**
- Custom `ErrorBoundary` component in `src/main.tsx`. Unhandled promise rejections are logged to console.

## CI/CD & Deployment

**Hosting:**
- Optimized Web application deployed as Static Assets (built via Vite). Likely Vercel or similar given Vercel Analytics usage.

---

*Integration audit: 2026-05-03*
