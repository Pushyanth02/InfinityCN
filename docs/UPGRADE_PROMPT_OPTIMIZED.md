# Optimized Prompt: Full Modernization & Upgrade Execution

Use this prompt when you want a safe, comprehensive modernization pass that is actually shippable:

> Perform a comprehensive modernization of this repository with production-safe upgrades.
> 
> Goals:
> 1) Upgrade dependencies (root + server) to latest stable versions.
> 2) Apply required code/config migrations for breaking changes.
> 3) Preserve behavior unless a security/performance fix is required.
> 4) Improve project structure where necessary (scripts, docs, CI consistency, env docs).
> 5) Add/adjust tests for changed behavior.
> 
> Execution requirements:
> - First inspect `AGENTS.md` and obey all scoped instructions.
> - Run: lint, tests, typecheck, and production builds for all packages.
> - If registry/network blocks upgrades, continue with best-effort codebase hardening and document exact blockers.
> - Commit all changes and create a PR with:
>   - what was upgraded
>   - breaking changes + migration notes
>   - validation evidence
> 
> Deliverables:
> - Updated manifests/lockfiles for successful upgrades.
> - Updated docs (`README`, security/deployment env vars, migration notes).
> - New tests for any new auth/rate-limit/flow changes.

## Why this is better

- Makes scope explicit (upgrade + migration + validation).
- Prevents “version bumps without fixes.”
- Forces evidence when environment limitations block package updates.
- Requires migration notes for maintainers.
