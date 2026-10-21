/** Light/dark mode choice; 'system' follows the OS preference. */
export type ThemeMode = 'light' | 'dark' | 'system'

/**
 * Colour palette preset, independent from the light/dark mode. Each preset
 * ships a light and a dark variant in `src/styles/tokens.css`.
 */
export type ThemePreset = 'graphite' | 'glass' | 'paper' | 'corporate' | 'midnight'

/** Accent hue layered on a preset; 'auto' keeps the preset's own accent. */
export type ThemeAccent = 'auto' | 'violet' | 'pink' | 'teal' | 'green' | 'amber' | 'red'
