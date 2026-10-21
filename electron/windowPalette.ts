import type { ThemePreset } from '../shared/theme'

/**
 * Native window colours per palette preset. Keep each entry aligned with the
 * matching `[data-theme]` block in `src/styles/tokens.css`:
 *   background      = --vzn-app-bg
 *   titleBar.color  = --vzn-titlebar-bg
 *   titleBar.symbol = --vzn-chrome-fg-muted
 * They paint the window before the renderer loads and the Windows caption
 * overlay, which CSS cannot reach.
 */
export interface WindowPalette {
  background: { light: string; dark: string }
  titleBar: { light: { color: string; symbolColor: string }; dark: { color: string; symbolColor: string } }
}

export const WINDOW_PALETTES: Record<ThemePreset, WindowPalette> = {
  graphite: {
    background: { light: '#EEEEEF', dark: '#161618' },
    titleBar: { light: { color: '#EEEEEF', symbolColor: '#48484A' }, dark: { color: '#242426', symbolColor: '#E5E5EA' } },
  },
  glass: {
    background: { light: '#F0F2F8', dark: '#0F1118' },
    titleBar: { light: { color: '#EEF0F7', symbolColor: '#596283' }, dark: { color: '#171A26', symbolColor: '#9AA3BD' } },
  },
  paper: {
    background: { light: '#ECE5D6', dark: '#1A1714' },
    titleBar: { light: { color: '#ECE5D6', symbolColor: '#6A5F54' }, dark: { color: '#26211C', symbolColor: '#D9CFC0' } },
  },
  corporate: {
    background: { light: '#F3F4F6', dark: '#0B1020' },
    /* Corporate paints its chrome navy even in light mode. */
    titleBar: { light: { color: '#141C2E', symbolColor: '#C7CFDD' }, dark: { color: '#080C17', symbolColor: '#B5C0D3' } },
  },
  midnight: {
    /* Dark only: the renderer pins dark mode, so both columns match. */
    background: { light: '#000000', dark: '#000000' },
    titleBar: { light: { color: '#000000', symbolColor: '#8D92A6' }, dark: { color: '#000000', symbolColor: '#8D92A6' } },
  },
}

export const DEFAULT_WINDOW_PALETTE: ThemePreset = 'graphite'

export function isThemePreset(value: unknown): value is ThemePreset {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(WINDOW_PALETTES, value)
}
