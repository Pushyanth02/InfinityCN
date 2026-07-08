# AGENTS.md

# Lemniscate — Repository Operating Instructions

## Purpose

This repository contains **Lemniscate**, a production-grade document processing and storytelling platform.

The objective is to reconstruct, stabilize, complete, and maintain the repository until it is production-ready.

This is **not** a greenfield project.

Agents must understand the existing codebase before making changes.

---

# Primary Goals

1. Preserve working functionality.
2. Repair broken functionality.
3. Complete unfinished implementations.
4. Reduce technical debt.
5. Improve maintainability.
6. Improve security.
7. Improve scalability.
8. Improve developer experience.
9. Improve test coverage.
10. Produce a deployable application.

---

# Guiding Principles

## Never rewrite working code without justification.

Prefer incremental improvements over large rewrites.

Every significant architectural change must have a measurable benefit.

---

## Think before changing code.

Before editing:

* Understand the feature.
* Understand dependencies.
* Trace execution flow.
* Identify affected modules.
* Evaluate downstream impact.

Do not make speculative changes.

---

## Always preserve repository consistency.

New code must match:

* project architecture
* naming conventions
* folder structure
* dependency direction
* coding style

---

# Required Workflow

For every task:

## 1. Understand

Read all related files.

Trace imports.

Understand data flow.

Understand API contracts.

Understand database interactions.

Understand worker interactions.

---

## 2. Plan

Document:

* current behavior
* desired behavior
* risks
* implementation strategy

---

## 3. Implement

Make the smallest safe change.

Avoid unnecessary refactoring.

Prefer improving existing modules over replacing them.

---

## 4. Validate

Ensure:

* project builds
* tests pass
* lint passes
* type checking passes
* API contracts remain valid
* no regressions introduced

---

## 5. Document

Every meaningful change should explain:

* what changed
* why
* affected modules
* migration requirements
* follow-up work

---

# Architecture Rules

Maintain clean separation between:

* UI
* API
* Services
* Domain
* Repositories
* Workers
* Queue
* Storage
* Parser
* NLP
* Database
* Utilities

Avoid circular dependencies.

Business logic must not live in UI components.

Parsing logic must not live in API routes.

Queue logic must remain separate from business logic.

---

# Tech Stack

> **Authoritative source:** `docs/ARCHITECTURE.md` and `README.md`. This project
> is a **TypeScript monolith** — there is no Python/FastAPI/Celery backend. An
> earlier revision of this document listed a Python stack that was never built;
> it has been corrected below to match the actual, verified implementation.

Frontend

* Next.js 16 (App Router)
* React 19
* TypeScript
* Tailwind CSS 4
* shadcn/ui (Radix primitives)
* Framer Motion
* Zustand (client state)

Backend (all TypeScript, in the same Next.js project)

* Next.js API routes (Node runtime)
* Prisma ORM
* SQLite (file-based, WAL mode)
* Standalone Bun worker (`mini-services/lemniscate-worker`) — Socket.IO + job poller
* Queue: SQLite `Job` table with atomic CAS claim (no Redis; `REDIS_URL` reserved for future)

Document Processing (deterministic, offline, no AI)

* `pdf-parse` (PDF, isolated child process)
* `mammoth` (DOCX)
* Native UTF-8 read (TXT/MD)
* Handcrafted NLP: regex tokenizer, rule-based segmentation, lexicons, gazetteers, statistical heuristics, graph analysis
* Custom deterministic rule engines (`src/lib/nlp`, `src/lib/pipeline`)

Deployment

* Docker
* Docker Compose
* Caddy reverse proxy

---

# Document Processing Rules

Supported formats:

* PDF
* DOCX
* TXT

Processing pipeline:

Upload

↓

Validation

↓

Storage

↓

SQLite Job Queue (atomic CAS claim)

↓

Extraction

↓

Cleaning

↓

Paragraph Reconstruction

↓

Scene Detection

↓

Character Detection

↓

Narrative Analysis

↓

Original Builder

↓

Cinematified Builder

↓

Reader

Every stage must be:

* restartable
* deterministic
* idempotent
* fault tolerant

---

# Original Mode

Must:

* preserve wording
* preserve chronology
* preserve facts
* reconstruct paragraphs
* improve readability

Must never:

* rewrite meaning
* invent information
* remove meaningful content

---

# Cinematified Mode

Must:

* detect scenes
* detect dialogue
* detect characters
* detect locations
* improve pacing
* improve presentation

Must never:

* invent events
* invent dialogue
* invent characters
* change chronology
* alter factual meaning

---

# Coding Standards

Prefer:

* readable code
* modular code
* descriptive naming
* strong typing
* dependency injection where appropriate

Avoid:

* magic numbers
* duplicated logic
* deeply nested functions
* large monolithic classes
* hidden side effects

---

# Error Handling

Never silently ignore exceptions.

Always:

* log meaningful errors
* return structured responses
* preserve useful debugging information
* avoid leaking sensitive information

---

# Security Requirements

Always validate:

* uploaded files
* MIME types
* extensions
* request payloads
* authentication
* authorization

Prevent:

* path traversal
* SQL injection
* XSS
* CSRF (where applicable)
* unsafe deserialization
* insecure file handling

Never commit:

* secrets
* API keys
* passwords
* credentials

---

# Performance Rules

Optimize for:

* large PDFs
* large DOCX files
* concurrent uploads
* efficient parsing
* memory efficiency
* lazy loading
* pagination
* indexed queries

Avoid unnecessary database queries.

Avoid loading entire documents into memory when streaming is practical.

---

# Queue & Worker Rules

Jobs must support:

* retries
* exponential backoff
* cancellation
* progress updates
* heartbeat
* timeout recovery
* duplicate prevention
* idempotency

Workers must shut down gracefully.

---

# Database Rules

Every schema change must include:

* migration
* indexes where appropriate
* constraints
* foreign keys
* rollback compatibility when feasible

---

# API Standards

APIs must be:

* versioned
* validated
* documented
* consistent

Use structured responses.

Return meaningful error messages.

Never expose stack traces.

---

# Frontend Standards

Pages should include:

* loading states
* empty states
* error states
* responsive layouts
* keyboard accessibility

Animations should enhance usability, not obscure it.

---

# Testing Requirements

Whenever business logic changes:

Add or update:

* unit tests
* integration tests
* parser tests
* API tests
* worker tests

Critical workflows should remain covered.

---

# Repository Hygiene

Remove:

* dead code
* unused imports
* duplicate utilities
* obsolete files
* commented-out implementations

Do not leave TODOs in completed work.

---

# Pull Request Checklist

Before considering work complete:

* Builds successfully
* Tests pass
* Lint passes
* Type checks pass
* No new warnings
* Documentation updated if required
* No duplicate code introduced
* No regressions observed

---

# Agent Behavior

Every agent should:

* reason before editing
* make incremental improvements
* preserve working functionality
* communicate assumptions
* document significant decisions
* avoid unnecessary rewrites

The goal is a stable, maintainable, secure, production-ready Lemniscate that can be confidently deployed and extended.
