/**
 * `thermal:*` IPC: support query, one-shot read, start/stop monitoring, module settings
 * (menu bar / tray reading); snapshots, read errors and settings changes are pushed to
 * the main window.
 */
import type { BrowserWindow, IpcMain } from 'electron'
import type { ThermalSettings, ThermalSnapshot, ThermalSupport } from '../../shared/thermalApi'
import { THERMAL_CHANNELS } from '../ipc/channels'
import type { ThermalService } from './service'
import { parseThermalSettingsPatch, type ThermalSettingsStore } from './settingsStore'

export interface ThermalIpcTarget {
  service: Pick<ThermalService, 'read' | 'setMonitoring'>
  settings: Pick<ThermalSettingsStore, 'get' | 'update'>
  /** Reader support plus where the tray reading can go on this run. */
  getSupport: () => ThermalSupport
}

export function registerThermalHandlers(ipcMain: IpcMain, target: ThermalIpcTarget): void {
  ipcMain.handle(THERMAL_CHANNELS.invoke.getSupport, () => ({ success: true, support: target.getSupport() }))

  ipcMain.handle(THERMAL_CHANNELS.invoke.read, async () => {
    try {
      return { success: true, snapshot: await target.service.read() }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Could not read the sensors.' }
    }
  })

  ipcMain.handle(THERMAL_CHANNELS.invoke.setMonitoring, (_event, active: unknown) => {
    if (typeof active !== 'boolean') return { success: false, error: 'Invalid "active" value.' }
    if (active && !target.getSupport().supported) return { success: false, error: 'Thermal sensors are not supported on this machine.' }
    target.service.setMonitoring(active)
    return { success: true }
  })

  ipcMain.handle(THERMAL_CHANNELS.invoke.getSettings, () => ({ success: true, settings: target.settings.get() }))

  ipcMain.handle(THERMAL_CHANNELS.invoke.updateSettings, (_event, raw: unknown) => {
    const parsed = parseThermalSettingsPatch(raw)
    if (!parsed.ok) return { success: false, error: parsed.error }
    if (parsed.patch.tray?.enabled && !target.getSupport().supported) {
      return { success: false, error: 'Thermal sensors are not supported on this machine.' }
    }
    try {
      return { success: true, settings: target.settings.update(parsed.patch) }
    } catch (e) {
      console.error('[Thermal] thermal:updateSettings failed:', e)
      return { success: false, error: 'Could not change the thermal settings.' }
    }
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
    settingsChanged: (settings: ThermalSettings) => sendToWindow(getMainWindow, THERMAL_CHANNELS.event.settingsChanged, settings),
  }
}
