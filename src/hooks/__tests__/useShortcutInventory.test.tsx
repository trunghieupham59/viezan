import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ModuleEnabledState } from '../../../shared/modules'
import { useShortcutInventory } from '../useShortcutInventory'

beforeEach(() => {
  // Quick Translate and the Launcher both on Alt+Space: a real collision while both run.
  ;(window as unknown as { api: unknown }).api = {
    platform: 'darwin',
    hotkey: {
      get: async () => ({ success: true, settings: { hotkey: 'Alt+Space', enabled: true } }),
      chat: { get: async () => ({ success: true, settings: { hotkey: 'Alt+Space', enabled: true } }) },
    },
  }
})

async function inventory(enabledModules: ModuleEnabledState) {
  const view = renderHook(() => useShortcutInventory({ enabledModules, chatSendShortcut: 'enter', chatNewSessionShortcut: '', platform: 'darwin' }))
  await act(async () => { await Promise.resolve() })
  return view.result.current
}

describe('useShortcutInventory', () => {
  it('flags Quick Translate and the Launcher when both are on with the same keys', async () => {
    const result = await inventory({} as ModuleEnabledState)
    expect(result.conflicts.has('quickTranslate')).toBe(true)
    expect(result.conflicts.has('launcher')).toBe(true)
  })

  it('treats Quick Translate as inactive while the Translate module is off, so it never conflicts', async () => {
    const result = await inventory({ translate: false } as ModuleEnabledState)
    const quick = result.entries.find((entry) => entry.id === 'quickTranslate')
    expect(quick?.active).toBe(false)
    expect(result.conflicts.size).toBe(0)
  })
})
