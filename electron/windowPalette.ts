import type { ThemePreset } from '../shared/theme'

/**
 * Native window colours per palette preset. Keep each entry aligned with the
 * matching `[data-theme]` block in `src/styles/tokens.css`:
 *   background      = --vzn-app-bg
 *   titleBar.color  = --vzn-titlebar-bg
 *   titleBar.symbol = --vzn-text-muted
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
  cosmos: {
    background: { light: '#EBECF7', dark: '#0F1020' },
    titleBar: { light: { color: '#EBECF7', symbolColor: '#5F6283' }, dark: { color: '#1B1C31', symbolColor: '#E2E3F3' } },
  },
  forest: {
    background: { light: '#EBEEE9', dark: '#111614' },
    titleBar: { light: { color: '#EBEEE9', symbolColor: '#5D6A61' }, dark: { color: '#1D2420', symbolColor: '#E1E8E3' } },
  },
  ember: {
    background: { light: '#F0EBE5', dark: '#181311' },
    titleBar: { light: { color: '#F0EBE5', symbolColor: '#6B5F55' }, dark: { color: '#251E1A', symbolColor: '#EBE3DC' } },
  },
}

export const DEFAULT_WINDOW_PALETTE: ThemePreset = 'graphite'

export function isThemePreset(value: unknown): value is ThemePreset {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(WINDOW_PALETTES, value)
}
