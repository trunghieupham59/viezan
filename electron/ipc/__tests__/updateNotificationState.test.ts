// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readNotificationState } from '../updateNotificationState'

describe('readNotificationState', () => {
  it('defaults the palette to Graphite and the accent to auto, keeping known values', () => {
    expect(readNotificationState(null)).toMatchObject({ themePreset: 'graphite', themeAccent: 'auto' })
    expect(readNotificationState({ themePreset: 'paper', themeAccent: 'teal' })).toMatchObject({ themePreset: 'paper', themeAccent: 'teal' })
  })

  it('rejects unknown palette and accent values without dropping the other preferences', () => {
    const state = readNotificationState({ themePreset: 'neon', themeAccent: 'blue', theme: 'dark', locale: 'vi' })
    expect(state).toMatchObject({ themePreset: 'graphite', themeAccent: 'auto', theme: 'dark', locale: 'vi' })
  })
})
