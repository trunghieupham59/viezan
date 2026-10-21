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
  studio: {
    background: { light: '#EFEAFB', dark: '#0E0A1C' },
    titleBar: { light: { color: '#EFEAFB', symbolColor: '#675C86' }, dark: { color: '#1A1330', symbolColor: '#D9D2EE' } },
  },
  paper: {
    background: { light: '#EBE6DC', dark: '#1A1714' },
    titleBar: { light: { color: '#EBE6DC', symbolColor: '#6A5F54' }, dark: { color: '#26211C', symbolColor: '#D9CFC0' } },
  },
  corporate: {
    background: { light: '#F3F4F6', dark: '#0B1020' },
    /* Corporate paints its chrome navy even in light mode. */
    titleBar: { light: { color: '#141C2E', symbolColor: '#C7CFDD' }, dark: { color: '#080C17', symbolColor: '#B5C0D3' } },
  },
}

export const DEFAULT_WINDOW_PALETTE: ThemePreset = 'graphite'

export function isThemePreset(value: unknown): value is ThemePreset {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(WINDOW_PALETTES, value)
}
