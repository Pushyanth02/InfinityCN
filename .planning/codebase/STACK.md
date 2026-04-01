# Technology Stack: InfinityCN
## The Cinematifier Engine

**Analysis Date:** 2026-03-30
**Version:** 15.0.0

---

## 💻 Frontend Core
- **Framework:** React 19.2.4 (Strict Mode enabled)
- **Tooling:** Vite 8.0.0 (Building for modern web and PWA)
- **State:** Zustand 5.0.11 (Atomic and fast global state management)
- **Database:** Dexie 4.3.0 (IndexedDB source of truth for the reader)
- **UI & Animations:** Framer Motion 12.35.2 (High-purity, fluid narrative transitions)
- **Icons:** Lucide React

## 🚀 Native ML & AI
- **Transformers.js:** Node-based and browser-resident ML for offline scene detection.
- **Tesseract.js:** Optical character recognition for physical document scanning.
- **PDF.js:** Server-side and client-side extraction of raw story data.

## 🏗️ Backend System
- **Node.js/Express 5:** Primary API gateway, user authentication, and lightweight job management.
- **.NET 9.0 Core:** High-performance narrative processing engine and heavy document serialization.
- **Redis:** Real-time synchronization of scene states across multi-device sessions.
- **RabbitMQ:** Asynchronous queuing for long-running cinematification jobs.

## ⚙️ Testing & Quality
- **Vitest:** Primary testing framework for the React application and core pipeline logic.
- **Testing Library:** DOM verification for narrative elements.
- **Husky & Lint-Staged:** Pre-commit enforcement of "Clean Code" rules.

---
*Stack audit: 2026-03-30*
