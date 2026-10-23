// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => ({
  trusted: true,
  prompts: 0,
  openExternal: vi.fn(),
  snapshot: { hotkey: 'Command+Space', enabled: true, disabledByViezan: false },
  conflict: null as null | { owner: string; accelerator: string },
}))

vi.mock('electron', () => ({
  systemPreferences: {
    isTrustedAccessibilityClient: (prompt: boolean) => {
      if (prompt) env.prompts += 1
      return env.trusted
    },
  },
  shell: { openExternal: (...args: unknown[]) => env.openExternal(...args) },
}))
vi.mock('../globalHotkey', () => ({ getLauncherSpotlightSnapshot: () => env.snapshot }))
vi.mock('../launcherSystemShortcut', () => ({
  detectSystemShortcutConflict: () => Promise.resolve(env.conflict),
}))

import { accessibilityCapability, spotlightCapability } from '../systemCapabilities'

function withPlatform(platform: NodeJS.Platform): () => void {
  const original = process.platform
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  return () => Object.defineProperty(process, 'platform', { value: original, configurable: true })
}

let restore: () => void
beforeEach(() => {
  restore = withPlatform('darwin')
  env.trusted = true
  env.prompts = 0
  env.openExternal.mockClear()
  env.snapshot = { hotkey: 'Command+Space', enabled: true, disabledByViezan: false }
  env.conflict = null
})
afterEach(() => { restore() })

describe('input.accessibility', () => {
  it('reports granted or denied on macOS and not-required elsewhere', async () => {
    expect(await accessibilityCapability.get()).toEqual({ id: 'input.accessibility', supported: true, permission: 'granted' })
    env.trusted = false
    expect(await accessibilityCapability.get()).toMatchObject({ permission: 'denied' })
    restore()
    restore = withPlatform('win32')
    expect(await accessibilityCapability.get()).toMatchObject({ permission: 'not-required' })
  })

  it('prompts and opens the Accessibility pane while denied, without reading the status with a prompt', async () => {
    env.trusted = false
    expect(await accessibilityCapability.request?.()).toMatchObject({ permission: 'denied' })
    expect(env.prompts).toBe(1)
    expect(env.openExternal).toHaveBeenCalledWith('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')

    env.trusted = true
    env.openExternal.mockClear()
    expect(await accessibilityCapability.request?.()).toMatchObject({ permission: 'granted' })
    expect(env.openExternal).not.toHaveBeenCalled()
    await accessibilityCapability.get()
    expect(env.prompts).toBe(2) // get() never prompts
  })
})

describe('launcher.spotlight', () => {
  it('is denied while a system shortcut owns the saved Launcher hotkey and carries the hand-over state', async () => {
    env.conflict = { owner: 'spotlight', accelerator: 'Command+Space' }
    expect(await spotlightCapability.get()).toEqual({
      id: 'launcher.spotlight',
      supported: true,
      permission: 'denied',
      detail: { hotkey: 'Command+Space', enabled: true, disabledByViezan: false, conflict: env.conflict },
    })

    env.conflict = null
    env.snapshot = { hotkey: 'Command+Space', enabled: true, disabledByViezan: true }
    expect(await spotlightCapability.get()).toMatchObject({ permission: 'granted', detail: { disabledByViezan: true, conflict: null } })
  })

  it('is unsupported off macOS', async () => {
    restore()
    restore = withPlatform('linux')
    expect(await spotlightCapability.get()).toMatchObject({ supported: false, permission: 'not-required' })
  })
})
