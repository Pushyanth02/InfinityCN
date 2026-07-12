'use client'

/**
 * Lemniscate — shared client hooks for the reader/library views.
 */
import * as React from 'react'

/** Debounce a value — used for search input and progress saves. */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState<T>(value)
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

/**
 * Trap keyboard focus inside `containerRef` while `active` is true.
 *
 * Implements the WAI-ARIA dialog pattern: on activation, focus moves to the
 * first focusable element (or the container); Tab/Shift+Tab cycle through the
 * focusable elements without escaping; on cleanup, focus is returned to the
 * element that had it when the trap was entered (the trigger).
 *
 * Used by reader overlays (search, bookmarks, export menu) so keyboard and
 * screen-reader users cannot leave a modal while it is open.
 *
 * @returns the container ref to attach to the trap's root element.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  active: boolean,
  /** Optional ref to focus first on activation (e.g. an input). If absent, the
   *  first focusable descendant is focused. */
  initialFocusRef?: React.RefObject<HTMLElement | null>,
): React.RefObject<T | null> {
  const containerRef = React.useRef<T | null>(null)
  const previouslyFocused = React.useRef<HTMLElement | null>(null)

  React.useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    previouslyFocused.current = (document.activeElement as HTMLElement) ?? null

    const getFocusable = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )

    // Move focus into the trap.
    const initial =
      initialFocusRef?.current ??
      getFocusable()[0] ??
      container
    initial.focus()

    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const focusable = getFocusable()
      if (focusable.length === 0) {
        e.preventDefault()
        container.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const activeEl = document.activeElement as HTMLElement
      if (e.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (activeEl === last || !container.contains(activeEl)) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    container.addEventListener('keydown', handleKey)

    return () => {
      container.removeEventListener('keydown', handleKey)
      // Return focus to the trigger.
      previouslyFocused.current?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  return containerRef
}
