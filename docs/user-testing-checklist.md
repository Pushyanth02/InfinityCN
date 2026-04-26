# User Testing Checklist — InfinityCN

## 1. General Usability

- [ ] Can users upload a book and start reading without confusion?
- [ ] Are all primary actions (upload, settings, navigation) discoverable?
- [ ] Is the interface clear and free of jargon?
- [ ] Are error and success messages clear and actionable?

## 2. Accessibility

- [ ] Can all interactive elements be reached and operated via keyboard?
- [ ] Are ARIA roles and labels present and correct?
- [ ] Is there a visible focus indicator for all controls?
- [ ] Does the skip-to-content link work as expected?
- [ ] Is color contrast sufficient for all text and controls?
- [ ] Are modals and overlays accessible to screen readers?

## 3. Navigation & Responsiveness

- [ ] Can users navigate between Home, Reader, and Settings easily?
- [ ] Does the UI adapt well to mobile and tablet screens?
- [ ] Are navigation and content layouts clear at all breakpoints?

## 4. Reader Experience

- [ ] Is the cinematic reading experience immersive and distraction-free?
- [ ] Are chapter navigation and progress indicators intuitive?
- [ ] Can users adjust preferences (font, size, theme) and see changes live?
- [ ] Is dyslexia mode easy to find and effective?
- [ ] Do cinematic depth metrics (scenes, cues, tension, mood) update correctly per chapter?
- [ ] Are word lens lookups responsive and resilient to API failures?

## 5. Settings & Providers

- [ ] Can users select and switch AI providers easily?
- [ ] Are API key inputs secure and user-friendly?
- [ ] Is feedback provided for connection tests?

## 6. Discovery APIs (Novel/Manga/Manhwa/Manhua)

- [ ] Are related-title suggestions shown for all content types when filter is set to `All`?
- [ ] Do content filters (`Novel`, `Manga`, `Manhwa`, `Manhua`) return matching results only?
- [ ] Are recommendation source badges accurate (Open Library, Google Books, Gutendex, Jikan, Kitsu)?
- [ ] Do empty-state and loading-state messages appear correctly when APIs are slow/unavailable?

## 7. Error Handling

- [ ] Are upload, parsing, and provider errors handled gracefully?
- [ ] Are users guided to resolve issues?

## 8. Feedback Collection

- [x] Is there a way for users to submit feedback or report issues?
- [x] Are user suggestions tracked for future improvements?

## 9. Release Readiness Gates (Required Before Feature Expansion)

- [ ] Mobile UX verification complete for upload, processing, and reader flows.
- [ ] Discovery filters verified for correctness across mixed source tags and edge responses.
- [ ] Accessibility sweep completed (keyboard, ARIA, focus ring, contrast, modal behavior).
- [ ] CI passes all gates: security audit, lint, type check, tests, and build.

---

_Use this checklist during manual user testing sessions and to guide further UI/UX iteration._

---

## Documentation Map Reference

- Master repository map: `/home/runner/work/InfinityCN/InfinityCN/README.md`
- Planning overview: `/home/runner/work/InfinityCN/InfinityCN/.planning/PROJECT.md`, `/home/runner/work/InfinityCN/InfinityCN/.planning/ROADMAP.md`, `/home/runner/work/InfinityCN/InfinityCN/.planning/STATE.md`
- Codebase map set: `/home/runner/work/InfinityCN/InfinityCN/.planning/codebase/STRUCTURE.md`, `/home/runner/work/InfinityCN/InfinityCN/.planning/codebase/ARCHITECTURE.md`, `/home/runner/work/InfinityCN/InfinityCN/.planning/codebase/INTEGRATIONS.md`
