import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron'
import type { AppActionRequest, AppsApi } from '../../shared/appsApi'
import { APPS_CHANNELS } from '../ipc/channels'

export function isAppActionRequest(value: unknown): value is AppActionRequest {
  if (!value || typeof value !== 'object') return false
  const r = value as AppActionRequest
  return id(r.planId) && Array.isArray(r.itemIds) && r.itemIds.length > 0 && r.itemIds.length <= 500 && r.itemIds.every(id)
    && (r.action === 'uninstall' || r.action === 'reset') && typeof r.quit === 'boolean' && ['vi', 'en', 'ja'].includes(r.locale)
}
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9-]{36}$/.test(v)

/** Only the main window's main frame can use the filesystem capability. */
export function registerAppsHandlers(ipc: IpcMain, api: AppsApi, getWindow: () => BrowserWindow | null) {
  const allowed = (event: IpcMainInvokeEvent) => {
    const contents = getWindow()?.webContents
    return contents && event.sender === contents && event.senderFrame === contents.mainFrame
  }
  const reject = { success: false, error: 'protected' }
  ipc.handle(APPS_CHANNELS.invoke.inventory, event => allowed(event) ? api.inventory() : reject)
  ipc.handle(APPS_CHANNELS.invoke.sessions, event => allowed(event) ? api.sessions() : reject)
  ipc.handle(APPS_CHANNELS.invoke.inspect, (event, value: unknown) => allowed(event) && id(value) ? api.inspect(value) : reject)
  ipc.handle(APPS_CHANNELS.invoke.undo, (event, value: unknown) => allowed(event) && id(value) ? api.undo(value) : reject)
  ipc.handle(APPS_CHANNELS.invoke.reveal, (event, value: unknown) => allowed(event) && id(value) ? api.reveal(value) : reject)
  ipc.handle(APPS_CHANNELS.invoke.apply, (event, value: unknown) =>
    allowed(event) && isAppActionRequest(value) ? api.apply(value) : { success: false, error: 'protected' })
}
