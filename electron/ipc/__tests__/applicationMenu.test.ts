import { beforeEach, describe, expect, it, vi } from 'vitest'

const { setApplicationMenu } = vi.hoisted(() => ({
  setApplicationMenu: vi.fn(),
}))

vi.mock('electron', () => ({
  Menu: { setApplicationMenu },
}))

import {
  configureApplicationMenu,
  isDevelopmentRuntime,
  shouldRemoveApplicationMenu,
} from '../../applicationMenu'

beforeEach(() => {
  setApplicationMenu.mockClear()
})

describe('commercial application menu', () => {
  it('removes the default Electron menu from packaged Windows builds', () => {
    const environment = { isPackaged: true, platform: 'win32' as const }

    expect(shouldRemoveApplicationMenu(environment)).toBe(true)
    configureApplicationMenu(environment)

    expect(setApplicationMenu).toHaveBeenCalledOnce()
    expect(setApplicationMenu).toHaveBeenCalledWith(null)
  })

  it('keeps the menu available while developing on Windows', () => {
    configureApplicationMenu({ isPackaged: false, platform: 'win32' })

    expect(setApplicationMenu).not.toHaveBeenCalled()
  })

  it('does not change the native macOS menu contract', () => {
    configureApplicationMenu({ isPackaged: true, platform: 'darwin' })

    expect(setApplicationMenu).not.toHaveBeenCalled()
  })
})

describe('runtime mode', () => {
  it('enables development behavior only for unpackaged builds', () => {
    expect(isDevelopmentRuntime(false)).toBe(true)
    expect(isDevelopmentRuntime(true)).toBe(false)
  })
})
