import type { ThemePreset } from '../../shared/theme'

/**
 * Palette presets available in Settings > Appearance, in display order.
 * Every id must have a matching `[data-theme="<id>"]` block in tokens.css
 * and an entry in the Electron window palette table.
 */
export const THEME_PRESETS = ['graphite', 'cosmos', 'forest', 'ember'] as const satisfies readonly ThemePreset[]

export const DEFAULT_THEME_PRESET: ThemePreset = 'graphite'

export function isThemePreset(value: unknown): value is ThemePreset {
  return typeof value === 'string' && (THEME_PRESETS as readonly string[]).includes(value)
}

export type { ThemePreset }
