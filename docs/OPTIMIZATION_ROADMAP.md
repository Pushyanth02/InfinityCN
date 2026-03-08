# InfinityCN Optimization Roadmap

## Executive Technical Audit Summary

InfinityCN is a well-architected, modern web application with solid foundations. The codebase demonstrates professional engineering practices including:

**Strengths:**
- ✅ Modern React 19 + TypeScript 5.9 stack
- ✅ Excellent lazy loading and code splitting strategy
- ✅ Multi-provider AI abstraction with streaming, dedup, LRU cache, and retry
- ✅ Offline-first architecture with IndexedDB (Dexie) + PWA service worker
- ✅ AES-GCM encrypted API key storage (device-derived key, SubtleCrypto)
- ✅ Full backend stack: Express 5 + Redis + RabbitMQ + SSE job events
- ✅ Redis-based sliding-window rate limiting (atomic Lua script)
- ✅ Redis AI response caching (SHA-256 keyed, 30min TTL)
- ✅ Clean separation of concerns (UI, state, business logic, server)
- ✅ 0 npm vulnerabilities (`npm audit` → clean)
- ✅ Node 22 enforced via `.nvmrc`, `engines` field, and CI workflow
- ✅ GitHub Actions CI: format → lint → type-check → test → build

**Areas for Improvement:**
- ⚠️ Limited E2E and integration test coverage (unit tests only)
- ⚠️ Large file processing could benefit from Web Workers
- ⚠️ No virtual scrolling for very long chapter block lists

---

## Prioritized Optimization Roadmap

### Phase 1: Resolved ✅

#### 1.1 Security Vulnerabilities ✅
All 5 high-severity CVEs resolved:
- Rollup (GHSA-mw96-cpmx-2vgc) → fixed via `npm audit fix`
- serialize-javascript (GHSA-5c6j-r48x-rmvq) → fixed via `overrides` in `package.json`

#### 1.2 Node Version Compatibility ✅
- Vite 7 requires `^20.19.0 || >=22.12.0`
- CI updated to `node-version: 22`
- `engines` field added to `package.json`
- `.nvmrc` added with `22`

#### 1.3 Build Artifact Hygiene ✅
- `.gitignore` updated to exclude `dotnet/**/obj/`, `dotnet/**/bin/`, `**/*.tsbuildinfo`
- 73 previously-tracked build artifacts removed from git index

#### 1.4 Dead Code Removal ✅
- Removed unused exported `isJobComplete` from `server/src/services/jobManager.ts`

#### 1.5 Documentation Accuracy ✅
- `README.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, `AI_GUIDE.md`, `DEVOPS_GUIDE.md`, `SECURITY.md` all updated to reflect the actual codebase structure (server at `server/src/`, not `server/proxy.ts`)

---

### Phase 2: High Priority (Within 2 Weeks)

#### 2.1 Add E2E Testing
**Priority:** 🟠 High
**Effort:** 2-3 days
**Impact:** Catches integration bugs before production

Recommended: Playwright
```bash
npm install -D @playwright/test
npx playwright install
```

Test scenarios:
- File upload flow (PDF, TXT, EPUB)
- Chapter navigation and reader modes
- AI settings configuration
- Bookmarks and reading progress
- Offline mode (service worker)

#### 2.2 Web Worker for Heavy Processing
**Priority:** 🟠 High
**Effort:** 2-3 days
**Impact:** Non-blocking UI during text extraction and cinematification

Create `src/workers/extract.worker.ts`:
```typescript
self.onmessage = async ({ data: { file } }) => {
  const { extractText } = await import('../lib/pdfWorker');
  const text = await extractText(file);
  self.postMessage({ text });
};
```

#### 2.3 Virtual Scrolling for Long Chapter Blocks
**Priority:** 🟠 High
**Effort:** 1-2 days
**Impact:** Smooth rendering of chapters with 1000+ cinematic blocks

```bash
npm install react-window
```

---

### Phase 3: Medium Priority (Within 1 Month)

#### 3.1 Performance Monitoring
**Priority:** 🟡 Medium
**Effort:** 1 day
**Impact:** Data-driven optimization

Core Web Vitals are already tracked via `@vercel/analytics` and `@vercel/speed-insights`. Add explicit LCP/CLS/INP logging:

```typescript
// main.tsx
import { onCLS, onINP, onLCP } from 'web-vitals';
onCLS(console.log);
onINP(console.log);
onLCP(console.log);
```

#### 3.2 Enhanced Error Recovery in CI
**Priority:** 🟡 Medium
**Effort:** 1 day
**Impact:** Faster detection of regressions

```yaml
# .github/workflows/ci.yml
- name: Run security audit
  run: npm audit --audit-level=high

- name: Run tests with coverage
  run: npm run test:coverage
```

#### 3.3 Anthropic Prompt Caching
**Priority:** 🟡 Medium
**Effort:** 2 hours
**Impact:** Up to 90% cost reduction for repeated context

```typescript
// In ai.ts Anthropic call
system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }]
```

---

### Phase 4: Low Priority (Within 3 Months)

#### 4.1 Accessibility Audit
**Priority:** 🟢 Low
**Effort:** 2-3 days
**Impact:** WCAG 2.1 AA compliance

Run `axe-core` audit, verify focus management in reader and settings modal.

#### 4.2 Internationalization (i18n)
**Priority:** 🟢 Low
**Effort:** 1 week
**Impact:** Global audience

```bash
npm install react-i18next i18next
```

#### 4.3 IndexedDB Quota Monitoring
**Priority:** 🟢 Low
**Effort:** 1 day
**Impact:** Prevent silent storage failures on large libraries

```typescript
const { quota, usage } = await navigator.storage.estimate();
if (usage / quota > 0.9) { /* warn user */ }
```

---

## DevOps Improvement Plan

### Current CI/CD Status: ✅ Good
- GitHub Actions: format → lint → type-check → test → build
- Node 22 via `node-version: 22`
- Build artifact uploaded on `main` branch push
- Concurrency control prevents duplicate runs

### Recommended Enhancements

```yaml
# Add to .github/workflows/ci.yml
- name: Security audit
  run: npm audit --audit-level=high

- name: Run tests with coverage
  run: npm run test:coverage

- name: Upload coverage
  uses: codecov/codecov-action@v4
```

---

## AI Performance Summary

### Current Status: ✅ Well-Optimized

**Client-side (`src/lib/ai.ts`):**
- Request deduplication (in-flight Map)
- LRU cache: 50 entries, 30-minute TTL
- Token bucket rate limiting per provider
- Exponential backoff with error classification (rate_limit, auth, network, timeout)
- Streaming for: Gemini, OpenAI, Anthropic, Groq, DeepSeek

**Server-side (`server/src/`):**
- Redis response cache: SHA-256 keyed, configurable TTL
- Per-IP sliding-window rate limiting (Lua atomic, Redis-backed)
- `MAX_TOKENS_CAP` prevents cost abuse
- RabbitMQ job queue with dead-letter queue and 1-hour message TTL
- Graceful Redis/RabbitMQ degradation (app continues without them)

---

## Risk Assessment

| Risk | Probability | Impact | Status |
|------|-------------|--------|--------|
| Dependency vulnerabilities | Low | High | ✅ 0 CVEs |
| Large file crashes browser | Medium | Medium | ⚠️ Web Workers pending |
| AI provider outage | Medium | Low | ✅ Multiple fallbacks |
| IndexedDB quota exceeded | Low | Medium | ⚠️ Monitoring pending |
| Breaking dependency updates | Medium | Medium | ✅ `engines` field enforced |
| Node version incompatibility | Low | High | ✅ Node 22, `.nvmrc` |

---

## Implementation Checklist

- [x] Fix 5 high CVEs (rollup, serialize-javascript)
- [x] Pin Node 22 (`.nvmrc`, `engines`, CI)
- [x] Remove dotnet build artifacts from git
- [x] Remove unused `isJobComplete` dead code
- [x] Update all documentation to match actual codebase
- [ ] Add Playwright E2E tests
- [ ] Implement virtual scrolling (react-window)
- [ ] Add Web Worker for PDF/text extraction
- [ ] Add Anthropic prompt caching
- [ ] Add Core Web Vitals instrumentation
- [ ] Accessibility audit (axe-core)

---

*Last Updated: March 2026*

