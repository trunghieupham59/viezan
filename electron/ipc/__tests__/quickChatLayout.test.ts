// @vitest-environment node
import type { BrowserWindow, IpcMain, IpcMainInvokeEvent, Rectangle } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerQuickChatHandlers } from '../quickChat'

vi.mock('../launcher', () => ({ registerLauncherHandlers: () => async () => {} }))

const mainFrame = {}
const contents = { mainFrame }
let bounds: Rectangle
const win = {
  webContents: contents, isDestroyed: () => false, getBounds: () => bounds,
  setBounds: vi.fn((next: Rectangle) => { bounds = next }),
  setMinimumSize: vi.fn(), setMaximumSize: vi.fn(), setResizable: vi.fn(),
}
const handlers = new Map<string, (event: IpcMainInvokeEvent, layout: unknown, contentHeight?: unknown) => unknown>()
const invoke = (layout: unknown, contentHeight?: unknown, sender = contents, senderFrame = mainFrame) =>
  handlers.get('quick-chat:set-layout')?.({ sender, senderFrame } as IpcMainInvokeEvent, layout, contentHeight)

beforeEach(() => {
  vi.clearAllMocks()
  handlers.clear()
  bounds = { x: 100, y: 200, width: 860, height: 540 }
  registerQuickChatHandlers({ handle: (name: string, handler: (event: IpcMainInvokeEvent, layout: unknown, contentHeight?: unknown) => unknown) => handlers.set(name, handler) } as unknown as IpcMain,
    () => null, () => win as unknown as BrowserWindow)
})

describe('quick chat layout IPC', () => {
  it('shrinks to search and expands for results or chat while preserving width', () => {
    expect(invoke('compact')).toEqual({ success: true })
    expect(win.setBounds).toHaveBeenLastCalledWith({ x: 100, y: 200, width: 860, height: 62 })
    expect(invoke('expanded')).toEqual({ success: true })
    expect(win.setBounds).toHaveBeenLastCalledWith({ x: 100, y: 200, width: 860, height: 540 })
    expect(win.setMinimumSize).toHaveBeenCalledWith(0, 0)
    expect(win.setMaximumSize).toHaveBeenCalledWith(0, 0)
    expect(win.setResizable).not.toHaveBeenCalled()
  })

  it('does not resize again when the current presentation already matches', () => {
    expect(invoke('expanded')).toEqual({ success: true })
    expect(win.setBounds).not.toHaveBeenCalled()
    expect(win.setMinimumSize).not.toHaveBeenCalled()
    expect(win.setMaximumSize).not.toHaveBeenCalled()
    expect(win.setResizable).not.toHaveBeenCalled()
  })

  it.each([[200, 200], [0, 62], [10_000, 540]])('uses measured content height %i within native bounds', (requested, expected) => {
    expect(invoke('expanded', requested)).toEqual({ success: true })
    expect(win.getBounds()).toEqual({ x: 100, y: 200, width: 860, height: expected })
    expect(win.setResizable).not.toHaveBeenCalled()
  })

  it('rejects invalid measured heights and compact sizing overrides', () => {
    for (const height of [-1, 100.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '200', { height: 200 }]) {
      expect(invoke('expanded', height)).toEqual({ success: false })
    }
    expect(invoke('compact', 200)).toEqual({ success: false })
    expect(invoke('expanded', 200, { mainFrame: {} })).toEqual({ success: false })
    expect(win.setBounds).not.toHaveBeenCalled()
  })

  it('rejects arbitrary dimensions, other windows and subframes', () => {
    for (const value of [undefined, null, 86, { width: 10000, height: 10000 }, 'other']) {
      expect(invoke(value)).toEqual({ success: false })
    }
    expect(invoke('expanded', undefined, { mainFrame: {} })).toEqual({ success: false })
    expect(invoke('expanded', undefined, contents, {})).toEqual({ success: false })
    expect(win.setBounds).not.toHaveBeenCalled()
  })
})
