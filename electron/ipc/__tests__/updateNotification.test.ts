// @vitest-environment node
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  windows: [] as unknown[], read: vi.fn(), write: vi.fn(), rename: vi.fn(), quit: vi.fn(),
}))
vi.mock('node:fs', () => ({ readFileSync: mocks.read, writeFileSync: mocks.write, renameSync: mocks.rename }))
vi.mock('electron', () => ({
  app: { isPackaged: true, getPath: () => '/data', once: mocks.quit },
  screen: { getCursorScreenPoint: () => ({ x: 0, y: 0 }), getDisplayNearestPoint: () => ({ workArea: { x: -1920, y: 0, width: 1920, height: 1080 } }) },
  BrowserWindow: class extends EventEmitter {
    visible = false
    destroyed = false
    topmost = true
    webContents = Object.assign(new EventEmitter(), { send: vi.fn(), isDestroyed: () => false, isLoading: () => false, setWindowOpenHandler: vi.fn() })
    constructor(public options: unknown) { super(); mocks.windows.push(this) }
    loadFile = vi.fn().mockResolvedValue(undefined)
    // Model Windows losing topmost when shown under a different foreground app.
    showInactive = vi.fn(() => { this.visible = true; this.topmost = false })
    setAlwaysOnTop = vi.fn((value: boolean) => { this.topmost = value })
    isAlwaysOnTop = () => this.topmost
    hide = vi.fn(() => { this.visible = false })
    isVisible = () => this.visible
    center = vi.fn()
    isDestroyed = () => this.destroyed
    destroy = () => { this.destroyed = true; this.emit('closed') }
  },
}))

import type { BrowserWindow } from 'electron'
import { createUpdateNotification } from '../../updateNotification'
import { NOTIFICATION_SNOOZE_MS } from '../updateNotificationState'

function setup(actions?: Parameters<typeof createUpdateNotification>[3]) {
  const handlers: Record<string, (event: unknown, value?: unknown) => unknown> = {}
  const main = { isDestroyed: () => false, webContents: { send: vi.fn(), isLoading: () => false, isDestroyed: () => false } }
  const show = vi.fn()
  const receive = createUpdateNotification({ handle: (name: string, handler: typeof handlers[string]) => { handlers[name] = handler } } as never, () => main as never, show, actions)
  const call = (name: string, value?: unknown, sender: unknown = main.webContents) => handlers[name]({ sender }, value)
  const window = () => mocks.windows[mocks.windows.length - 1] as BrowserWindow
  const available = (version = '3.0.0') => { receive({ type: 'available', version, background: true }); window().emit('ready-to-show') }
  return { call, receive, available, window, main, show }
}
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); mocks.windows = []; mocks.read.mockReturnValue('{}') })
afterEach(() => vi.useRealTimers())

describe('independent update notifications', () => {
  it('keeps the popup visible and allows retry when saving a reminder fails', () => {
    const s = setup()
    s.available()
    const sender = s.window().webContents
    mocks.rename.mockImplementationOnce(() => { throw new Error('disk full') })
    expect(s.call('update-popup:act', 'later', sender)).toBe(false)
    expect(s.window().isVisible()).toBe(true)
    expect(s.call('update-popup:snapshot', undefined, sender)).toMatchObject({ error: true })
    expect(s.call('update-popup:act', 'later', sender)).toBe(true)
    expect(s.window().isVisible()).toBe(false)
    vi.advanceTimersByTime(NOTIFICATION_SNOOZE_MS)
    expect(s.window().isVisible()).toBe(true)
    expect(s.call('update-popup:snapshot', undefined, sender)).toMatchObject({ error: false })
  })

  it('downloads in the popup, retains progress, prevents duplicate actions and requires an explicit install', async () => {
    let complete: (value: { success: boolean }) => void = () => undefined
    const download = vi.fn(() => new Promise<{ success: boolean }>((resolve) => { complete = resolve }))
    const install = vi.fn().mockResolvedValue({ success: true })
    const s = setup({ download, install })
    s.available()
    const sender = s.window().webContents
    expect(s.call('update-popup:act', 'install', sender)).toBe(false)
    expect(s.call('update-popup:act', 'download')).toBe(false)
    const pending = s.call('update-popup:act', 'download', sender)
    expect(s.call('update-popup:act', 'download', sender)).toBe(false)
    s.receive({ type: 'downloading', percent: 42 })
    expect(s.window().isVisible()).toBe(true)
    expect(s.call('update-popup:snapshot', undefined, sender)).toMatchObject({ version: '3.0.0', downloading: true, percent: 42 })
    s.receive({ type: 'downloaded', version: '3.0.0' })
    complete({ success: true })
    await pending
    expect(install).not.toHaveBeenCalled()
    expect(await s.call('update-popup:act', 'install', sender)).toBe(true)
    expect(install).toHaveBeenCalledTimes(1)
    expect(s.show).not.toHaveBeenCalled()
  })

  it('offers a retry after failure and allows dismissal during a download', async () => {
    const download = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ success: true })
    const s = setup({ download, install: vi.fn() })
    s.available()
    const sender = s.window().webContents
    expect(await s.call('update-popup:act', 'download', sender)).toBe(false)
    expect(s.call('update-popup:snapshot', undefined, sender)).toMatchObject({ error: true, ready: false })
    expect(await s.call('update-popup:act', 'download', sender)).toBe(true)
    s.receive({ type: 'downloading', percent: 30 })
    expect(s.call('update-popup:act', 'later', sender)).toBe(true)
    s.receive({ type: 'downloaded', version: '3.0.0' })
    expect(s.window().isVisible()).toBe(false)
  })

  it('shows without activating the main window, reuses one popup and ignores transient background events', () => {
    const s = setup()
    s.available()
    expect(s.window().isVisible()).toBe(true)
    expect(s.window().isAlwaysOnTop()).toBe(true)
    expect(s.show).not.toHaveBeenCalled()
    expect((s.window() as unknown as { options: unknown }).options).toMatchObject({ alwaysOnTop: true, show: false, skipTaskbar: true, x: -1180, y: 380, webPreferences: { sandbox: true, nodeIntegration: false } })
    s.receive({ type: 'checking', background: true })
    s.receive({ type: 'error', background: true })
    s.available()
    expect(mocks.windows).toHaveLength(1)
    expect(s.window().showInactive).toHaveBeenCalledTimes(1)
    expect(s.window().setAlwaysOnTop).toHaveBeenCalledTimes(1)
  })

  it('persists snooze, suppresses duplicates, wakes in main after 24h and allows a different release', () => {
    const s = setup()
    s.available()
    s.call('update-popup:act', 'later', s.window().webContents)
    expect(s.window().isVisible()).toBe(false)
    s.available()
    expect(s.window().isVisible()).toBe(false)
    vi.advanceTimersByTime(NOTIFICATION_SNOOZE_MS)
    expect(s.window().isVisible()).toBe(true)
    expect(s.window().isAlwaysOnTop()).toBe(true)
    s.call('update-popup:act', 'dismiss', s.window().webContents)
    const saved = mocks.write.mock.calls[mocks.write.mock.calls.length - 1]?.[1]
    mocks.read.mockReturnValue(saved)
    const resumed = setup()
    resumed.receive({ type: 'available', version: '3.0.0' })
    expect(mocks.windows).toHaveLength(1)
    resumed.available('3.1.0')
    expect(mocks.windows).toHaveLength(2)
  })

  it('disables and persists notifications without blocking status, and opens Settings only on view', () => {
    const s = setup()
    s.available()
    expect(s.call('updater:setNotificationPreferences', { enabled: false })).toMatchObject({ enabled: false })
    expect(s.window().isVisible()).toBe(false)
    s.receive({ type: 'downloaded', version: '3.0.0' })
    expect(s.window().isVisible()).toBe(false)
    s.call('updater:setNotificationPreferences', { enabled: true, locale: 'vi' })
    expect(s.window().isVisible()).toBe(true)
    s.call('update-popup:act', 'view', s.window().webContents)
    expect(s.show).toHaveBeenCalledTimes(1)
    expect(s.main.webContents.send).toHaveBeenCalledWith('updater:openSettings')
    expect(s.call('updater:consumeOpenSettings', undefined, s.window().webContents)).toBe(false)
    expect(s.call('updater:consumeOpenSettings')).toBe(true)
    expect(s.call('updater:consumeOpenSettings')).toBe(false)
  })

  it('restricts IPC to its designated window and validates actions', () => {
    const s = setup()
    s.available()
    expect(s.call('update-popup:act', 'view')).toBe(false)
    expect(s.call('update-popup:snapshot')).toBeNull()
    expect(s.call('updater:setNotificationPreferences', { enabled: false }, s.window().webContents)).toBeNull()
    expect(s.call('update-popup:act', 'install', s.window().webContents)).toBe(false)
    expect(s.window().isVisible()).toBe(true)
  })

  it('does not show after disable during load, cancels reminders on quit, and reports persistence failure', () => {
    const s = setup()
    s.receive({ type: 'available', version: '3.0.0' })
    s.call('updater:setNotificationPreferences', { enabled: false })
    s.window().emit('ready-to-show')
    expect(s.window().isVisible()).toBe(false)
    mocks.write.mockImplementationOnce(() => { throw new Error('disk full') })
    expect(s.call('updater:setNotificationPreferences', { enabled: true })).toBeNull()
    expect(s.call('updater:notificationPreferences')).toMatchObject({ enabled: false })
    s.call('updater:setNotificationPreferences', { enabled: true })
    s.call('update-popup:act', 'later', s.window().webContents)
    mocks.quit.mock.calls[0][1]()
    vi.advanceTimersByTime(NOTIFICATION_SNOOZE_MS)
    expect(mocks.windows).toHaveLength(1)
    expect(s.window().isDestroyed()).toBe(true)
  })
})
