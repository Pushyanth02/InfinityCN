# Testing Strategy: InfinityCN

## Comprehensive Validation

**Analysis Date:** 2026-03-30
**Standard:** Verify Every Phase

---

## 🏛️ Frontend Testing (React)

- **Framework:** Vitest 4.0.18.
- **Tools:** `@testing-library/react` and `jsdom`.
- **Strategy:**
    - **Unit Testing:** Focus on core cinematifier logic in `src/lib/cinematifier` (segmentation, sentiment analysis, parsing).
    - **Component Testing:** Verify the "Cinematic Reader" rendering and dynamic typography adjustments.
    - **Visual Audit:** Cross-phase visual audit of all implemented UI pillars.

## ⚙️ Runtime & Pipeline Testing

- **Focus:** Runtime services (`src/lib/runtime`) and cinematification pipeline (`src/lib/engine/cinematifier`).
- **Strategy:**
    - **Core Integration:** Validate stage ordering and typed outputs from input cleanup through renderer planning.
    - **Mocking:** Mock external APIs/providers to verify timeout, retry, and fallback behavior.

## 🧪 GSD Verification Requirements

Every phase of work must be tested against:

1. **Valid Input:** Standard use cases with normal story length.
2. **Invalid Input:** Malformed files, unexpected JSON, or empty documents.
3. **Large Input:** 100K+ word novels to ensure no memory leaks or UI lag.
4. **Failure Scenarios:** Disconnected internet, AI timeout, or processing service crash.

---

_Testing audit: 2026-03-30_

---

## Documentation Map Reference

- Master repository map: `/home/runner/work/InfinityCN/InfinityCN/README.md`
- Planning overview: `/home/runner/work/InfinityCN/InfinityCN/.planning/PROJECT.md`, `/home/runner/work/InfinityCN/InfinityCN/.planning/ROADMAP.md`, `/home/runner/work/InfinityCN/InfinityCN/.planning/STATE.md`
- Codebase map set: `/home/runner/work/InfinityCN/InfinityCN/.planning/codebase/STRUCTURE.md`, `/home/runner/work/InfinityCN/InfinityCN/.planning/codebase/ARCHITECTURE.md`, `/home/runner/work/InfinityCN/InfinityCN/.planning/codebase/INTEGRATIONS.md`
