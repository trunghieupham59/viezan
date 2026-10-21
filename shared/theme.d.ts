/** Light/dark mode choice; 'system' follows the OS preference. */
export type ThemeMode = 'light' | 'dark' | 'system'

/**
 * Colour palette preset, independent from the light/dark mode. Each preset
 * ships a light and a dark variant in `src/styles/tokens.css`.
 */
export type ThemePreset = 'graphite' | 'studio' | 'paper' | 'corporate'
