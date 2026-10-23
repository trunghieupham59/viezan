/**
 * `thermal:*` IPC: support query, one-shot read, start/stop monitoring; snapshots and
 * read errors are pushed to the main window.
 */
import type { BrowserWindow, IpcMain } from 'electron'
import type { ThermalSnapshot } from '../../shared/thermalApi'
import { THERMAL_CHANNELS } from '../ipc/channels'
import type { ThermalService } from './service'

export function registerThermalHandlers(ipcMain: IpcMain, service: ThermalService): void {
  ipcMain.handle(THERMAL_CHANNELS.invoke.getSupport, () => ({ success: true, support: service.getSupport() }))

  ipcMain.handle(THERMAL_CHANNELS.invoke.read, async () => {
    try {
      return { success: true, snapshot: await service.read() }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Could not read the sensors.' }
    }
  })

  ipcMain.handle(THERMAL_CHANNELS.invoke.setMonitoring, (_event, active: unknown) => {
    if (typeof active !== 'boolean') return { success: false, error: 'Invalid "active" value.' }
    if (active && !service.getSupport().supported) return { success: false, error: 'Thermal sensors are not supported on this machine.' }
    service.setMonitoring(active)
    return { success: true }
  })
}

function sendToWindow(getMainWindow: () => BrowserWindow | null, channel: string, payload: unknown) {
  const win = getMainWindow()
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(channel, payload)
}

export function createThermalBroadcaster(getMainWindow: () => BrowserWindow | null) {
  return {
    snapshot: (snapshot: ThermalSnapshot) => sendToWindow(getMainWindow, THERMAL_CHANNELS.event.snapshot, snapshot),
    error: (error: { message: string }) => sendToWindow(getMainWindow, THERMAL_CHANNELS.event.error, error),
  }
}
