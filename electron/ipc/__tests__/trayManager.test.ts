import { beforeEach, describe, expect, it, vi } from 'vitest'

const trayInstances: Array<{
  image: unknown
  setToolTip: ReturnType<typeof vi.fn>
  setContextMenu: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
}> = []
let imageIsEmpty = false
const dialogState = vi.hoisted(() => ({ response: 0 }))
const showMessageBox = vi.hoisted(() => vi.fn(async () => ({ response: dialogState.response })))
let menuTemplate: Array<{ label?: string; type?: string; click?: () => void }> = []

vi.mock('electron', () => {
  class Tray {
    image: unknown
    setToolTip = vi.fn()
    setContextMenu = vi.fn()
    on = vi.fn()
    constructor(image: unknown) {
      this.image = image
      trayInstances.push(this)
    }
  }
  return {
    Tray,
    dialog: { showMessageBox },
    Menu: {
      buildFromTemplate: vi.fn((template: typeof menuTemplate) => {
        menuTemplate = template
        return { template }
      }),
    },
    nativeImage: {
      createFromPath: vi.fn(() => ({
        isEmpty: () => imageIsEmpty,
        resize: vi.fn((size: unknown) => ({ resized: size })),
      })),
    },
  }
})

import {
  createAppTray,
  getTrayLabels,
  promptCloseAction,
  resolveTrayLocale,
  shouldHideMainWindowOnClose,
  supportsTrayResidency,
} from '../../trayManager'

beforeEach(() => {
  trayInstances.length = 0
  imageIsEmpty = false
  menuTemplate = []
  dialogState.response = 0
  showMessageBox.mockClear()
})

describe('shouldHideMainWindowOnClose', () => {
  it('hides to the tray on Windows and Linux when a tray exists and no quit is in progress', () => {
    expect(shouldHideMainWindowOnClose({ platform: 'win32', isQuitting: false, hasTray: true })).toBe(true)
    expect(shouldHideMainWindowOnClose({ platform: 'linux', isQuitting: false, hasTray: true })).toBe(true)
  })

  it('lets the window close while quitting (tray menu, updater, relaunch, shutdown)', () => {
    expect(shouldHideMainWindowOnClose({ platform: 'win32', isQuitting: true, hasTray: true })).toBe(false)
  })

  it('does not hide when there is no tray, so the app cannot become unreachable', () => {
    expect(shouldHideMainWindowOnClose({ platform: 'win32', isQuitting: false, hasTray: false })).toBe(false)
  })

  it('leaves macOS to its dock-resident behavior', () => {
    expect(shouldHideMainWindowOnClose({ platform: 'darwin', isQuitting: false, hasTray: true })).toBe(false)
    expect(supportsTrayResidency('darwin')).toBe(false)
  })
})

describe('tray labels', () => {
  it('maps OS locales onto supported languages and falls back to English', () => {
    expect(resolveTrayLocale('vi')).toBe('vi')
    expect(resolveTrayLocale('vi-VN')).toBe('vi')
    expect(resolveTrayLocale('ja_JP')).toBe('ja')
    expect(resolveTrayLocale('fr-FR')).toBe('en')
    expect(resolveTrayLocale(undefined)).toBe('en')
    expect(getTrayLabels('vi-VN').quit).toBe('Thoát Viezan')
  })
})

describe('createAppTray', () => {
  it('passes the multi-resolution ICO to Windows without flattening its DPI frames', () => {
    createAppTray({ iconPath: 'tray.ico', platform: 'win32', osLocale: 'en', onOpen: vi.fn(), onQuit: vi.fn() })
    expect(trayInstances[0].image).toBe('tray.ico')
  })

  it('keeps the existing 16px native image behavior on Linux', () => {
    createAppTray({ iconPath: 'icon.png', platform: 'linux', osLocale: 'en', onOpen: vi.fn(), onQuit: vi.fn() })
    expect(trayInstances[0].image).toEqual({ resized: { width: 16, height: 16 } })
  })

  it('builds a tray with an open/quit menu and restores on click', () => {
    const onOpen = vi.fn()
    const onQuit = vi.fn()
    const tray = createAppTray({ iconPath: 'icon.png', osLocale: 'en-US', onOpen, onQuit })

    expect(tray).not.toBeNull()
    expect(trayInstances).toHaveLength(1)
    expect(trayInstances[0].setToolTip).toHaveBeenCalledWith('Viezan')
    expect(menuTemplate.map((item) => item.label ?? item.type)).toEqual(['Open Viezan', 'separator', 'Quit Viezan'])

    menuTemplate[0].click?.()
    menuTemplate[2].click?.()
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onQuit).toHaveBeenCalledTimes(1)

    const events = trayInstances[0].on.mock.calls.map(([name]) => name)
    expect(events).toEqual(expect.arrayContaining(['click', 'double-click']))
  })

  it('lets a development run override the tooltip so it is distinguishable from the official app', () => {
    createAppTray({ iconPath: 'icon.png', tooltip: 'Viezan (Dev)', osLocale: 'vi-VN', onOpen: vi.fn(), onQuit: vi.fn() })

    expect(trayInstances[0].setToolTip).toHaveBeenCalledWith('Viezan (Dev)')
  })

  it('returns null instead of an invisible tray when the icon cannot be loaded', () => {
    imageIsEmpty = true
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(createAppTray({ iconPath: 'missing.png', osLocale: 'en', onOpen: vi.fn(), onQuit: vi.fn() })).toBeNull()
    expect(trayInstances).toHaveLength(0)
  })
})

describe('promptCloseAction', () => {
  const window = {} as never

  it('maps the chosen button onto keep-in-tray, quit or cancel', async () => {
    dialogState.response = 0
    await expect(promptCloseAction(window, 'en')).resolves.toBe('tray')
    dialogState.response = 1
    await expect(promptCloseAction(window, 'en')).resolves.toBe('quit')
    dialogState.response = 2
    await expect(promptCloseAction(window, 'en')).resolves.toBe('cancel')
  })

  it('localizes the dialog and makes dismissal a cancel', async () => {
    await promptCloseAction(window, 'vi-VN')
    expect(showMessageBox).toHaveBeenCalledWith(
      window,
      expect.objectContaining({ buttons: ['Thu nhỏ xuống khay', 'Thoát hẳn', 'Hủy'], defaultId: 0, cancelId: 2 }),
    )
  })
})
