# Pull Request

## Summary

<!-- One or two sentences: what does this change do and why? -->

## Type of change

- [ ] Bug fix (non-breaking)
- [ ] New feature (non-breaking)
- [ ] Refactor / chore (no behavior change)
- [ ] Breaking change (please describe impact below)
- [ ] Docs / infra

## The two hard constraints — confirm before requesting review

- [ ] **No AI.** This change adds no LLMs, AI APIs, or ML models. Any new
      "intelligent" behavior lives in `src/lib/nlp/` lexicons / rule engines.
- [ ] **Verbatim story text.** This change never invents characters, events,
      dialogue, or reorders chronology. Every line of story text is sourced
      verbatim from the input.

## Validation

Run locally before requesting review:

- [ ] `bun run lint`
- [ ] `npx tsc --noEmit`
- [ ] `bun run test`
- [ ] `bun run build` (or `npm run build`)
- [ ] Security tests: `npx vitest run src/__tests__/security/`

If this changes the DB schema, attach the migration / `db push` diff.

## Related issues

Closes #<!-- issue number -->

## Notes for reviewers

<!-- Anything reviewers should pay attention to, tricky trade-offs, screenshots. -->
