import type { ThemeAccent, ThemePreset } from '../../shared/theme'

/**
 * Style presets available in Settings > Appearance, in display order. Each
 * one is a persona (surfaces, accent intensity, chrome, shape, depth, reading
 * type), not just a hue. Every id must have a matching `[data-theme="<id>"]`
 * pair in tokens.css and an entry in the Electron window palette table.
 */
export const THEME_PRESETS = ['graphite', 'glass', 'paper', 'corporate', 'midnight'] as const satisfies readonly ThemePreset[]

export const DEFAULT_THEME_PRESET: ThemePreset = 'graphite'

export interface ThemePresetTraits {
  /** The preset only ships a dark variant; the app keeps `html.dark` on regardless of the mode setting. */
  darkOnly: boolean
  /**
   * The preset wants the OS window material (macOS vibrancy, Windows 11
   * acrylic) behind a transparent shell in every mode, not only when the
   * mode follows the OS.
   */
  nativeMaterial: boolean
}

export const THEME_PRESET_TRAITS: Record<ThemePreset, ThemePresetTraits> = {
  graphite: { darkOnly: false, nativeMaterial: false },
  glass: { darkOnly: false, nativeMaterial: true },
  paper: { darkOnly: false, nativeMaterial: false },
  corporate: { darkOnly: false, nativeMaterial: false },
  midnight: { darkOnly: true, nativeMaterial: false },
}

/** Accent choices in display order; 'auto' follows the style preset. Each other id has a `[data-accent]` pair in tokens.css. */
export const THEME_ACCENTS = ['auto', 'violet', 'pink', 'teal', 'green', 'amber', 'red'] as const satisfies readonly ThemeAccent[]

export const DEFAULT_THEME_ACCENT: ThemeAccent = 'auto'

export function isThemeAccent(value: unknown): value is ThemeAccent {
  return typeof value === 'string' && (THEME_ACCENTS as readonly string[]).includes(value)
}

export function isThemePreset(value: unknown): value is ThemePreset {
  return typeof value === 'string' && (THEME_PRESETS as readonly string[]).includes(value)
}

/** Light/dark mode the window should actually render for a preset. */
export function resolveThemeMode(theme: 'light' | 'dark' | 'system', preset: ThemePreset): 'light' | 'dark' | 'system' {
  return THEME_PRESET_TRAITS[preset].darkOnly ? 'dark' : theme
}

export type { ThemeAccent, ThemePreset }
