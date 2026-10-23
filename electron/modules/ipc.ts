/**
 * `modules:get` / `modules:setEnabled` IPC and the `modules:changed` push.
 */
import type { BrowserWindow, IpcMain } from 'electron'
import type { ModuleEnabledState } from '../../shared/modules'
import { MODULES_CHANNELS } from '../ipc/channels'
import type { ModuleHost } from './host'

export function registerModuleHandlers(ipcMain: IpcMain, host: ModuleHost): void {
  ipcMain.handle(MODULES_CHANNELS.invoke.get, () => ({ success: true, enabled: host.getState() }))

  ipcMain.handle(MODULES_CHANNELS.invoke.setEnabled, async (_event, id: unknown, enabled: unknown) => {
    if (!host.isKnown(id)) return { success: false, error: 'Unknown module.' }
    if (typeof enabled !== 'boolean') return { success: false, error: 'Invalid "enabled" value.' }
    try {
      return { success: true, enabled: await host.setEnabled(id, enabled) }
    } catch (e) {
      console.error('[Modules] modules:setEnabled failed:', e)
      return { success: false, error: 'Could not change the module.' }
    }
  })
}

/** Tell the main window a module was turned on or off. */
export function broadcastModulesChanged(getMainWindow: () => BrowserWindow | null, state: ModuleEnabledState): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send(MODULES_CHANNELS.event.changed, state)
  }
}
