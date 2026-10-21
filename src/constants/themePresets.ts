import type { ThemePreset } from '../../shared/theme'

/**
 * Palette presets available in Settings > Appearance, in display order. Each
 * one is a persona (surfaces, accent intensity, chrome, shape, depth, reading
 * type), not just a hue. Every id must have a matching `[data-theme="<id>"]`
 * pair in tokens.css and an entry in the Electron window palette table.
 */
export const THEME_PRESETS = ['graphite', 'studio', 'paper', 'corporate'] as const satisfies readonly ThemePreset[]

export const DEFAULT_THEME_PRESET: ThemePreset = 'graphite'

export function isThemePreset(value: unknown): value is ThemePreset {
  return typeof value === 'string' && (THEME_PRESETS as readonly string[]).includes(value)
}

export type { ThemePreset }
