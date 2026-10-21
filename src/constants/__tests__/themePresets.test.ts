import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THEME_ACCENT,
  DEFAULT_THEME_PRESET,
  isThemeAccent,
  isThemePreset,
  resolveThemeMode,
  THEME_ACCENTS,
  THEME_PRESET_TRAITS,
  THEME_PRESETS,
} from '../themePresets'

describe('theme presets', () => {
  it('lists every preset once, starting with the default', () => {
    expect(THEME_PRESETS[0]).toBe(DEFAULT_THEME_PRESET)
    expect(new Set(THEME_PRESETS).size).toBe(THEME_PRESETS.length)
    for (const preset of THEME_PRESETS) expect(THEME_PRESET_TRAITS[preset]).toBeDefined()
  })

  it('recognises only known preset ids', () => {
    expect(isThemePreset('midnight')).toBe(true)
    expect(isThemePreset('studio')).toBe(false)
    expect(isThemePreset(null)).toBe(false)
  })

  it('lists accents starting with the follow-the-style default', () => {
    expect(THEME_ACCENTS[0]).toBe(DEFAULT_THEME_ACCENT)
    expect(DEFAULT_THEME_ACCENT).toBe('auto')
    expect(isThemeAccent('teal')).toBe(true)
    expect(isThemeAccent('blue')).toBe(false)
    expect(isThemeAccent(undefined)).toBe(false)
  })

  it('pins dark mode for dark-only presets and leaves the others alone', () => {
    expect(resolveThemeMode('light', 'midnight')).toBe('dark')
    expect(resolveThemeMode('system', 'midnight')).toBe('dark')
    expect(resolveThemeMode('light', 'glass')).toBe('light')
    expect(resolveThemeMode('system', 'graphite')).toBe('system')
  })
})
