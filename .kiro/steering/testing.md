# Testing Steering

## Philosophy

Tests exist to catch regressions and verify business-critical behavior.

Write tests that increase confidence in production correctness, not tests that merely increase coverage numbers.

---

## Test Pyramid

### Unit Tests

- Cover all domain logic, parsers, and utility functions.
- Must be fast, deterministic, and isolated.
- No external dependencies (database, Redis, filesystem, network).
- Mock or stub infrastructure boundaries.

### Integration Tests

- Verify interactions between modules, services, and infrastructure.
- Test API routes with real request/response cycles.
- Test database queries against a real (local) database.
- Test worker job execution end-to-end.

### End-to-End Tests

- Cover critical user flows only.
- Upload → process → read is the primary happy path.
- Keep E2E tests minimal and stable.

---

## Coverage Expectations

- Domain logic: high coverage (aim for 90%+).
- API routes: integration tests for every endpoint.
- Parsers: comprehensive unit tests including edge cases.
- Workers: integration tests covering success, failure, and retry paths.
- UI components: test behavioral logic, not markup structure.

---

## When to Write Tests

- Every bug fix must include a regression test that fails without the fix.
- Every new feature must include tests for its core behavior.
- Every parser change must include tests with representative input.
- Refactors must not reduce test coverage.

---

## What Not to Test

- Trivial getters/setters.
- Framework internals.
- Third-party library behavior.
- Pure UI layout (unless interaction logic is involved).

---

## Test Quality

- Tests must be readable and self-documenting.
- Use descriptive test names that explain the scenario.
- Arrange-Act-Assert structure.
- One logical assertion per test when practical.
- Avoid testing implementation details; test behavior.

---

## Document Processing Tests

- Test extraction with real sample files (PDF, DOCX, TXT).
- Verify paragraph reconstruction produces expected output.
- Verify scene detection identifies known boundaries.
- Verify character detection finds expected entities.
- Test edge cases: empty documents, single-paragraph documents, very large documents.

---

## API Tests

- Test success responses with valid input.
- Test validation errors with malformed input.
- Test authorization enforcement.
- Test pagination and filtering.
- Verify response shape matches documented contracts.

---

## Worker Tests

- Test job completion with valid input.
- Test retry behavior on transient failures.
- Test timeout handling.
- Test progress reporting.
- Test cancellation.
- Test idempotency (running the same job twice produces the same result).

---

## Frontend Tests

- Test custom hooks in isolation.
- Test state management logic.
- Test user interactions (click, type, navigate).
- Test loading, error, and empty states.
- Avoid snapshot tests for frequently changing UI.

---

## Test Data

- Use factories or builders for test data.
- Avoid hardcoded IDs or timestamps that create brittle tests.
- Keep test fixtures minimal and representative.
- Store sample documents in a dedicated test fixtures directory.

---

## CI Requirements

- All tests must pass before merge.
- Test failures block deployment.
- Flaky tests must be fixed or quarantined immediately.
- Test execution time should remain under 5 minutes for the full suite.

---

## Test Naming Convention

Use a consistent pattern:

- `[unit] <module> — <behavior under test>`
- `[integration] <feature> — <scenario>`
- `[e2e] <workflow> — <expected outcome>`

---

## Mocking Rules

- Mock at module boundaries, not within modules.
- Prefer dependency injection over global mocking.
- Never mock the module under test.
- Reset mocks between tests.
