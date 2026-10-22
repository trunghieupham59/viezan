// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isPackaged: true,
  settings: { openAtLogin: false },
  getLoginItemSettings: vi.fn(),
  setLoginItemSettings: vi.fn(),
}))
vi.mock('electron', () => ({
  app: {
    get isPackaged() { return mocks.isPackaged },
    getLoginItemSettings: mocks.getLoginItemSettings,
    setLoginItemSettings: mocks.setLoginItemSettings,
    relaunch: vi.fn(),
    quit: vi.fn(),
  },
  nativeTheme: {},
  shell: {},
  systemPreferences: {},
}))

import { registerSystemHandlers } from '../system'

type Handler = (event: unknown, ...args: unknown[]) => unknown

function setup() {
  const handlers: Record<string, Handler> = {}
  const mainContents = { send: vi.fn(), isDestroyed: () => false }
  const win = { isDestroyed: () => false, webContents: mainContents }
  registerSystemHandlers({ handle: (channel: string, handler: Handler) => { handlers[channel] = handler } } as never, () => win as never)
  const call = (channel: string, value?: unknown, sender: unknown = mainContents) => handlers[channel]({ sender }, value)
  return { call }
}

function setPlatform(value: NodeJS.Platform): () => void {
  const original = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', { value })
  return () => { if (original) Object.defineProperty(process, 'platform', original) }
}

describe('login item IPC', () => {
  let restorePlatform: () => void = () => undefined
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isPackaged = true
    mocks.settings = { openAtLogin: false }
    mocks.getLoginItemSettings.mockImplementation(() => mocks.settings)
    mocks.setLoginItemSettings.mockImplementation((next: { openAtLogin: boolean }) => { mocks.settings = { openAtLogin: next.openAtLogin } })
    restorePlatform()
    restorePlatform = setPlatform('win32')
  })

  it('reads and writes the OS login item with the hidden-start argument on Windows', () => {
    const { call } = setup()
    expect(call('app:getLoginItemSettings')).toEqual({ supported: true, openAtLogin: false })
    expect(call('app:setLoginItemSettings', true)).toEqual({ success: true, openAtLogin: true })
    expect(mocks.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true, args: ['--hidden'] })
    expect(mocks.getLoginItemSettings).toHaveBeenLastCalledWith({ args: ['--hidden'] })
    expect(call('app:getLoginItemSettings')).toEqual({ supported: true, openAtLogin: true })
    expect(call('app:setLoginItemSettings', false)).toEqual({ success: true, openAtLogin: false })
  })

  it('registers a plain login item on macOS', () => {
    restorePlatform()
    restorePlatform = setPlatform('darwin')
    const { call } = setup()
    expect(call('app:setLoginItemSettings', true)).toEqual({ success: true, openAtLogin: true })
    expect(mocks.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true, args: [] })
  })

  it('reports failure when the OS did not apply the change', () => {
    mocks.setLoginItemSettings.mockImplementation(() => undefined)
    const { call } = setup()
    expect(call('app:setLoginItemSettings', true)).toEqual({ success: false, openAtLogin: false })
    mocks.setLoginItemSettings.mockImplementation(() => { throw new Error('registry locked') })
    expect(call('app:setLoginItemSettings', true)).toMatchObject({ success: false, openAtLogin: false, error: 'registry locked' })
  })

  it('is unsupported in development runs and on Linux, and rejects bad input and other windows', () => {
    mocks.isPackaged = false
    const { call } = setup()
    expect(call('app:getLoginItemSettings')).toEqual({ supported: false, openAtLogin: false })
    expect(call('app:setLoginItemSettings', true)).toMatchObject({ success: false })
    expect(mocks.setLoginItemSettings).not.toHaveBeenCalled()

    mocks.isPackaged = true
    restorePlatform()
    restorePlatform = setPlatform('linux')
    expect(call('app:getLoginItemSettings')).toEqual({ supported: false, openAtLogin: false })

    restorePlatform()
    restorePlatform = setPlatform('win32')
    expect(call('app:setLoginItemSettings', 'yes')).toMatchObject({ success: false, error: 'Invalid value' })
    expect(call('app:setLoginItemSettings', true, { other: true })).toEqual({ success: false, openAtLogin: false, error: 'Untrusted sender' })
    expect(call('app:getLoginItemSettings', undefined, { other: true })).toEqual({ supported: false, openAtLogin: false })
    expect(mocks.setLoginItemSettings).not.toHaveBeenCalled()
  })
})
