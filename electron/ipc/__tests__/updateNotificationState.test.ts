// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readNotificationState } from '../updateNotificationState'

describe('readNotificationState', () => {
  it('defaults the palette to Graphite and keeps a known preset', () => {
    expect(readNotificationState(null).themePreset).toBe('graphite')
    expect(readNotificationState({ themePreset: 'paper' }).themePreset).toBe('paper')
  })

  it('rejects an unknown palette without dropping the other preferences', () => {
    const state = readNotificationState({ themePreset: 'neon', theme: 'dark', locale: 'vi' })
    expect(state).toMatchObject({ themePreset: 'graphite', theme: 'dark', locale: 'vi' })
  })
})
