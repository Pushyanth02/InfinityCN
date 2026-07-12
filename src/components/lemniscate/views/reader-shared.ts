/**
 * Lemniscate — Shared reader helpers
 * ----------------------------------------------------------------------------
 * Typography/layout resolution and scene-heading construction, shared between
 * `reader.tsx` and its extracted sub-components. Kept in a standalone module so
 * components can be split out of the reader monolith without duplicating
 * helpers or creating circular imports.
 */
import {
  useLemniscate,
  type FontSize,
  type LineHeight,
  type FontFamily,
  type ReaderWidth,
} from '../store'
import type { ReaderScene, ReaderLocation } from './reader-types'

/**
 * Reader font sizes expressed in **rem** so they honor the browser's
 * user-configured default font size (browser/OS accessibility zoom). The values
 * match the old px scale at the default 16px root: 17/18/20/23px → ~1.0625 /
 * 1.125 / 1.25 / 1.4375rem. The consumer applies this as an inline CSS value.
 */
export const FONT_SIZE_REM: Record<FontSize, string> = {
  sm: '1.0625rem',
  md: '1.125rem', // matches .text-reader-body default
  lg: '1.25rem',
  xl: '1.4375rem',
}

/**
 * @deprecated Use {@link FONT_SIZE_REM}. Kept (and now an alias to the rem
 * values) so existing imports keep working while consumers migrate; new code
 * should use `FONT_SIZE_REM` directly.
 */
export const FONT_SIZE_PX = FONT_SIZE_REM

export const FONT_SIZE_ORDER: FontSize[] = ['sm', 'md', 'lg', 'xl']

const LINE_HEIGHT: Record<LineHeight, number> = {
  compact: 1.55,
  normal: 1.8,
  relaxed: 2.05,
}

const FONT_FAMILY: Record<FontFamily, string> = {
  serif: 'var(--font-reader)',
  sans: 'var(--font-sans-stack)',
}

const READER_MAX_WIDTH: Record<ReaderWidth, string> = {
  narrow: '32rem',
  medium: '38rem',
  wide: '46rem',
}

/** Hook: resolve the reader's typography/layout preferences into inline styles. */
export function useReaderTypography(): {
  lineHeight: number
  fontFamily: string
  maxWidth: string
} {
  const lineHeight = useLemniscate((s) => s.readerLineHeight)
  const fontFamily = useLemniscate((s) => s.readerFontFamily)
  const width = useLemniscate((s) => s.readerWidth)
  return {
    lineHeight: LINE_HEIGHT[lineHeight],
    fontFamily: FONT_FAMILY[fontFamily],
    maxWidth: READER_MAX_WIDTH[width],
  }
}

/** Build an `INT./EXT. LOCATION — TIME` heading from scene fields. */
export function buildSceneHeading(
  scene: ReaderScene,
  locations: ReaderLocation[],
): string {
  if (scene.heading && scene.heading.trim()) return scene.heading
  const locName = scene.location?.trim()
  const locType = locName
    ? locations.find(
        (l) =>
          l.name.toLowerCase() === locName.toLowerCase() ||
          locName.toLowerCase().includes(l.name.toLowerCase()) ||
          l.name.toLowerCase().includes(locName.toLowerCase()),
      )?.type
    : undefined
  const prefix =
    locType === 'INDOOR' || locType === 'VEHICLE'
      ? 'INT.'
      : locType === 'OUTDOOR' || locType === 'URBAN' || locType === 'NATURE'
        ? 'EXT.'
        : '—'
  const loc = locName ? locName.toUpperCase() : 'UNKNOWN LOCATION'
  const tod = scene.timeOfDay || 'CONTINUOUS'
  return `${prefix} ${loc} — ${tod}`
}
