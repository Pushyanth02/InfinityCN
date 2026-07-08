# UI/UX Steering

## Design Philosophy

The interface should feel like a premium reading application — calm, elegant, and focused.

Every interaction should respect the user's attention and time.

---

## Design System

### Colors

- Use a restrained palette.
- Dark mode is the primary experience.
- Light mode is a supported alternative.
- Accent colors should draw attention sparingly.
- Ensure sufficient contrast ratios (WCAG AA minimum).

### Typography

- Prioritize readability.
- Use a serif or transitional font for reading content.
- Use a clean sans-serif for UI chrome.
- Maintain a clear typographic hierarchy (headings, body, captions).
- Line height: 1.5–1.8 for body text.
- Optimal line length: 50–75 characters.

### Spacing

- Use consistent spacing scale (4px base unit).
- Generous whitespace improves reading comfort.
- Avoid cramped layouts.

### Iconography

- Use a consistent icon set.
- Icons should be meaningful, not decorative.
- Pair icons with labels when clarity requires it.

---

## Motion and Animation

### Principles

- Motion should communicate state changes.
- Motion should guide attention.
- Motion should never delay user action.
- Respect reduced-motion preferences.

### Guidelines

- Page transitions: subtle fades or slides (200–300ms).
- Micro-interactions: 100–200ms.
- Loading indicators: appear after 300ms delay to avoid flicker.
- Never animate purely for decoration.

### Library

- Use Framer Motion for declarative animations.
- Keep animation definitions colocated with components.
- Reuse motion variants for consistency.

---

## Accessibility

### Requirements

- WCAG 2.1 AA compliance minimum.
- Full keyboard navigation.
- Screen reader compatibility.
- Focus management for modals and overlays.
- ARIA labels for non-text interactive elements.
- Skip navigation links.
- Visible focus indicators.

### Testing

- Test with keyboard-only navigation.
- Test with screen readers (VoiceOver, NVDA).
- Validate with automated tools (axe, Lighthouse).
- Note: full WCAG compliance requires manual testing with assistive technologies.

---

## Responsive Design

### Breakpoints

- Mobile: < 640px
- Tablet: 640px – 1024px
- Desktop: > 1024px

### Rules

- Mobile-first CSS.
- Content remains readable at all breakpoints.
- Navigation adapts gracefully (hamburger menu on mobile).
- Reader view optimizes for the current viewport.
- Touch targets: minimum 44x44px on mobile.

---

## Component Architecture

### Structure

- Atomic design: atoms → molecules → organisms → templates → pages.
- Keep components focused on a single responsibility.
- Separate presentational components from logic containers.
- Use composition over configuration.

### State

- Local state for UI-only concerns (open/closed, hover, focus).
- Global state (Zustand) for shared application state.
- Server state (TanStack Query) for remote data.
- Offline state (Dexie) for reading progress and bookmarks.

---

## Page States

Every page and data-dependent component must handle:

- Loading state (skeleton or spinner).
- Empty state (helpful guidance, not blank).
- Error state (actionable message, retry option).
- Success state (the primary content).

---

## Reader UX

The reader is the primary product experience.

### Requirements

- Distraction-free reading area.
- Adjustable font size.
- Progress indicator.
- Chapter/scene navigation.
- Bookmark support.
- Search within narrative.
- Smooth scroll or paginated reading.
- Persistent reading position.

### Performance

- Virtualize long narratives.
- Lazy-load chapters/scenes.
- Maintain 60fps scroll performance.
- Preload adjacent content.

---

## Library UX

### Requirements

- Grid and list view options.
- Search with instant feedback.
- Filter by status, format, date.
- Sort by title, date, progress.
- Bulk actions (delete, export).
- Upload with drag-and-drop.
- Processing status visibility.
- Clear metadata display.

---

## Interaction Patterns

- Confirm destructive actions (delete, discard).
- Provide undo where practical.
- Show progress for long operations.
- Use optimistic UI for fast-feeling interactions.
- Toast notifications for transient feedback.
- Inline validation for forms.

---

## Error Communication

- Use plain language.
- Explain what happened.
- Suggest what the user can do.
- Never show raw error codes or stack traces.
- Provide a retry option when appropriate.
