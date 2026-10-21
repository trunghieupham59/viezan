// @vitest-environment node
import type { BrowserWindow, IpcMain, IpcMainInvokeEvent, Rectangle } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerQuickChatHandlers } from '../quickChat'

vi.mock('../launcher', () => ({ registerLauncherHandlers: () => async () => {} }))
vi.mock('electron', () => ({ app: { getPath: () => '/userData' } }))
const fs = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn(), rename: vi.fn(), mkdir: vi.fn(), rm: vi.fn() }))
vi.mock('node:fs/promises', () => fs)

const mainFrame = {}
const contents = { mainFrame }
let bounds: Rectangle
const win = {
  webContents: contents, isDestroyed: () => false, getBounds: () => bounds,
  setBounds: vi.fn((next: Rectangle) => { bounds = next }),
  setMinimumSize: vi.fn(), setMaximumSize: vi.fn(), setResizable: vi.fn(), hide: vi.fn(),
}
const mainWindow = {
  isMinimized: () => false, restore: vi.fn(), show: vi.fn(), focus: vi.fn(),
  webContents: { send: vi.fn() },
}
const handlers = new Map<string, (event: IpcMainInvokeEvent, layout: unknown, contentHeight?: unknown) => unknown>()
const invoke = (layout: unknown, contentHeight?: unknown, sender = contents, senderFrame = mainFrame) =>
  handlers.get('quick-chat:set-layout')?.({ sender, senderFrame } as IpcMainInvokeEvent, layout, contentHeight)

beforeEach(() => {
  vi.clearAllMocks()
  handlers.clear()
  fs.readFile.mockRejectedValue(new Error('ENOENT'))
  for (const op of [fs.writeFile, fs.rename, fs.mkdir, fs.rm]) op.mockResolvedValue(undefined)
  bounds = { x: 100, y: 200, width: 860, height: 540 }
  registerQuickChatHandlers({ handle: (name: string, handler: (event: IpcMainInvokeEvent, layout: unknown, contentHeight?: unknown) => unknown) => handlers.set(name, handler) } as unknown as IpcMain,
    () => mainWindow as unknown as BrowserWindow, () => win as unknown as BrowserWindow)
})

describe('quick chat session persistence', () => {
  const call = (channel: string, payload?: unknown, sender: unknown = contents, senderFrame: unknown = mainFrame) =>
    handlers.get(channel)?.({ sender, senderFrame } as IpcMainInvokeEvent, payload)
  const turns = [{ role: 'user', text: 'Hi' }, { role: 'assistant', text: 'Hello' }]
  const session = { id: 'quick-ai-1', turns, updatedAt: 1_700_000_000_000 }

  it('stores a validated session under userData and returns it until cleared', async () => {
    expect(await call('quick-chat:session:get')).toEqual({ success: true, session: null })
    expect(await call('quick-chat:session:save', session)).toEqual({ success: true })
    expect(fs.rename).toHaveBeenCalledWith('/userData/quick-ai-session-v1.json.tmp', '/userData/quick-ai-session-v1.json')
    expect(await call('quick-chat:session:get')).toEqual({ success: true, session })
    expect(await call('quick-chat:session:clear')).toEqual({ success: true })
    expect(await call('quick-chat:session:get')).toEqual({ success: true, session: null })
  })

  it('rejects malformed sessions and other senders', async () => {
    expect(await call('quick-chat:session:save', { id: 'x', turns: [{ role: 'user', text: 'orphan' }], updatedAt: 1 })).toMatchObject({ success: false })
    expect(await call('quick-chat:session:save', session, { mainFrame: {} })).toMatchObject({ success: false })
    expect(await call('quick-chat:session:get', undefined, contents, {})).toEqual({ success: false, session: null })
    expect(await call('quick-chat:session:clear', undefined, { mainFrame: {} })).toMatchObject({ success: false })
    expect(fs.writeFile).not.toHaveBeenCalled()
    expect(fs.rm).not.toHaveBeenCalled()
  })

  it('carries validated history into the main chat and rejects broken history', async () => {
    const base = { question: 'Next?', provider: 'local', model: 'local-auto' }
    expect(await call('quick-chat:open-in-chat', { ...base, history: turns })).toEqual({ success: true })
    expect(mainWindow.webContents.send).toHaveBeenLastCalledWith('quick-chat:open-in-main-chat', { ...base, history: turns, response: undefined })
    expect(await call('quick-chat:open-in-chat', { ...base, history: [] })).toEqual({ success: true })
    expect(mainWindow.webContents.send).toHaveBeenLastCalledWith('quick-chat:open-in-main-chat', { ...base, history: undefined, response: undefined })
    expect(await call('quick-chat:open-in-chat', { ...base, history: [{ role: 'user', text: 'orphan' }] })).toMatchObject({ success: false })
    expect(mainWindow.webContents.send).toHaveBeenCalledTimes(2)
  })
})

describe('quick chat feature deep links', () => {
  const open = (payload: unknown, sender: unknown = contents, senderFrame: unknown = mainFrame) =>
    handlers.get('quick-chat:open-feature')?.({ sender, senderFrame } as IpcMainInvokeEvent, payload)

  it('forwards validated feature requests to the main window and hides the popup', () => {
    expect(open({ feature: 'translate', text: ' hello ' })).toEqual({ success: true })
    expect(mainWindow.webContents.send).toHaveBeenLastCalledWith('quick-chat:open-feature', { feature: 'translate', text: 'hello' })
    expect(open({ feature: 'live' })).toEqual({ success: true })
    expect(mainWindow.webContents.send).toHaveBeenLastCalledWith('quick-chat:open-feature', { feature: 'live' })
    expect(win.hide).toHaveBeenCalledTimes(2)
    expect(mainWindow.show).toHaveBeenCalledTimes(2)
  })

  it('rejects unknown features, oversized or blank text, and other senders', () => {
    for (const payload of [{ feature: 'shell' }, { feature: 'translate', text: '' }, { feature: 'dictionary', text: 'x'.repeat(501) }, 'translate', null]) {
      expect(open(payload)).toMatchObject({ success: false })
    }
    expect(open({ feature: 'live' }, { mainFrame: {} })).toMatchObject({ success: false })
    expect(open({ feature: 'live' }, contents, {})).toMatchObject({ success: false })
    expect(mainWindow.webContents.send).not.toHaveBeenCalled()
    expect(win.hide).not.toHaveBeenCalled()
  })
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
