// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMocks = vi.hoisted(() => ({
  nativeTheme: { themeSource: 'system' },
  relaunch: vi.fn(),
  quit: vi.fn(),
  exit: vi.fn(),
  openExternal: vi.fn(),
}))

vi.mock('electron', () => ({
  app: { relaunch: electronMocks.relaunch, quit: electronMocks.quit, exit: electronMocks.exit },
  nativeTheme: electronMocks.nativeTheme,
  shell: { openExternal: electronMocks.openExternal },
  systemPreferences: { getMediaAccessStatus: vi.fn() },
}))

import { registerSystemHandlers } from '../system'

type Handler = (event: unknown, ...args: unknown[]) => unknown

function setup(getMainWindow?: () => unknown, applyWindowPalette?: (preset: string) => void) {
  const handlers: Record<string, Handler> = {}
  const ipc = { handle: (channel: string, handler: Handler) => { handlers[channel] = handler } }
  registerSystemHandlers(ipc as never, getMainWindow as never, applyWindowPalette as never)
  return handlers
}

describe('system handlers', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('app:relaunch goes through app.quit so will-quit cleanup runs', () => {
    const handlers = setup()
    handlers['app:relaunch']({})
    expect(electronMocks.relaunch).toHaveBeenCalledTimes(1)
    expect(electronMocks.quit).toHaveBeenCalledTimes(1)
    expect(electronMocks.exit).not.toHaveBeenCalled()
  })

  it('app:relaunch refuses senders other than the main window', () => {
    const mainContents = { isDestroyed: () => false }
    const handlers = setup(() => ({ isDestroyed: () => false, webContents: mainContents }))

    expect(handlers['app:relaunch']({ sender: { isDestroyed: () => false } })).toEqual({
      success: false,
      error: 'Untrusted sender',
    })
    expect(electronMocks.quit).not.toHaveBeenCalled()

    expect(handlers['app:relaunch']({ sender: mainContents })).toEqual({ success: true })
    expect(electronMocks.quit).toHaveBeenCalledTimes(1)
  })

  it('app:openExternal awaits shell.openExternal and swallows failures', async () => {
    electronMocks.openExternal.mockRejectedValueOnce(new Error('boom'))
    const handlers = setup()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(handlers['app:openExternal']({}, 'https://example.org.evil.io/')).resolves.toBeUndefined()
    expect(electronMocks.openExternal).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('app:setWindowTheme applies only valid themes from the main window', () => {
    const mainContents = { isDestroyed: () => false }
    const handlers = setup(() => ({ isDestroyed: () => false, webContents: mainContents }))

    handlers['app:setWindowTheme']({ sender: mainContents }, 'dark')
    expect(electronMocks.nativeTheme.themeSource).toBe('dark')

    handlers['app:setWindowTheme']({ sender: mainContents }, 'neon')
    expect(electronMocks.nativeTheme.themeSource).toBe('dark')

    handlers['app:setWindowTheme']({ sender: { isDestroyed: () => false } }, 'light')
    expect(electronMocks.nativeTheme.themeSource).toBe('dark')
  })

  it('app:setWindowTheme forwards only known palette presets to the window', () => {
    const mainContents = { isDestroyed: () => false }
    const applyWindowPalette = vi.fn()
    const handlers = setup(() => ({ isDestroyed: () => false, webContents: mainContents }), applyWindowPalette)

    handlers['app:setWindowTheme']({ sender: mainContents }, 'light', 'cosmos')
    expect(applyWindowPalette).toHaveBeenCalledWith('cosmos')
    expect(electronMocks.nativeTheme.themeSource).toBe('light')

    handlers['app:setWindowTheme']({ sender: mainContents }, 'dark', 'neon')
    expect(applyWindowPalette).toHaveBeenCalledTimes(1)
    expect(electronMocks.nativeTheme.themeSource).toBe('dark')

    handlers['app:setWindowTheme']({ sender: mainContents }, 'system')
    expect(applyWindowPalette).toHaveBeenCalledTimes(1)
    expect(electronMocks.nativeTheme.themeSource).toBe('system')
  })
})
