# Coding Conventions

**Analysis Date:** 2026-05-03

## Naming Patterns

**Files:**
- React components utilize `PascalCase.tsx`
- TypeScript logic, utilities, configuration use `camelCase.ts` or `kebab-case.js`

**Functions:**
- Logic functionality favors `camelCase` for variables and actions.

## Code Style

**Formatting:**
- Tool used: Prettier
- Defines strict code alignment managed through `npm run format`.

**Linting:**
- Tool used: ESLint 10 (Flat config)
- Plugins: `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`.

## Import Organization

**Path Aliases:**
- `@app/*` -> `./src/app`
- `@features/*` -> `./src/features`
- `@shared/*` -> `./src/shared`
- `@assets/*` -> `./src/assets`

## Error Handling

**Patterns:**
- Extensive usage of `try/catch` and Promise rejection capturing (`catch`). Global uncaught handling sits at `window.addEventListener('unhandledrejection')` in `main.tsx`.

## Logging

**Framework:** `console`
- Primarily custom console calls with namespacing. Prefix patterns (e.g. `console.error('[Appwrite] Ping failed')`).

## Function Design

- Strong typing adherence. No `any` explicitly specified where strict `typescript-eslint` catches it.
- Pure hooks implementation over component complexity where possible. 

---

*Convention analysis: 2026-05-03*
