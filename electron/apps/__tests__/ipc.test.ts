// @vitest-environment node
import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import type { AppsApi } from '../../../shared/appsApi'
import { isAppActionRequest, registerAppsHandlers } from '../ipc'

const uuid = '00000000-0000-4000-8000-000000000000'
describe('apps capability boundary', () => {
  it('validates complete mutation requests and refuses paths as IDs', () => {
    const request = { planId: uuid, itemIds: [uuid], action: 'reset', quit: true, locale: 'vi' }
    expect(isAppActionRequest(request)).toBe(true)
    for (const invalid of [null, {}, { ...request, itemIds: ['/Users/a/.ssh'] }, { ...request, action: 'exec' }, { ...request, itemIds: [] }, { ...request, locale: '__proto__' }]) expect(isAppActionRequest(invalid)).toBe(false)
  })
  it('rejects subframes and secondary windows before calling the service', async () => {
    const handlers = new Map<string, (event: IpcMainInvokeEvent, value?: unknown) => unknown>()
    const ipc = { handle: (key: string, fn: (event: IpcMainInvokeEvent) => unknown) => handlers.set(key, fn) } as unknown as IpcMain
    const frame = {}; const sender = { mainFrame: frame }
    const inventory = vi.fn(async () => ({ success: true, data: [] }))
    registerAppsHandlers(ipc, { inventory } as unknown as AppsApi, () => ({ webContents: sender } as unknown as BrowserWindow))
    const invoke = (s: unknown, f: unknown) => handlers.get('apps:inventory')?.({ sender: s, senderFrame: f } as IpcMainInvokeEvent)
    expect(await invoke({}, frame)).toMatchObject({ success: false })
    expect(await invoke(sender, {})).toMatchObject({ success: false })
    expect(inventory).not.toHaveBeenCalled()
    expect(await invoke(sender, frame)).toMatchObject({ success: true })
  })
})
