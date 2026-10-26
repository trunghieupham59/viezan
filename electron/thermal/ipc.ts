/**
 * `thermal:*` IPC: support query, one-shot read, start/stop monitoring, module settings
 * (menu bar / tray reading) and fan control (`thermal:fan:*`); snapshots, read errors,
 * settings changes and fan control state are pushed to the main window.
 */
import type { BrowserWindow, IpcMain } from 'electron'
import type { FanCalibrationState, FanControlState, FanProfilesState, ThermalSettings, ThermalSnapshot, ThermalSupport } from '../../shared/thermalApi'
import { THERMAL_CHANNELS } from '../ipc/channels'
import type { FanCalibrationService } from './fanCalibration'
import { type FanControlService, isFanCommand } from './fanControlTypes'
import type { FanProfileService } from './fanProfiles'
import { isUserFanProfileId, isValidFanProfileName, MAX_FAN_PROFILE_NAME_LENGTH } from './fanProfilesSchema'
import type { ThermalService } from './service'
import { parseThermalSettingsPatch, type ThermalSettingsStore } from './settingsStore'

export interface ThermalIpcTarget {
  service: Pick<ThermalService, 'read' | 'setMonitoring'>
  settings: Pick<ThermalSettingsStore, 'get' | 'update'>
  /** Reader support plus where the tray reading can go on this run. */
  getSupport: () => ThermalSupport
  fanControl: Pick<FanControlService, 'getState' | 'enable' | 'setFan' | 'restoreAll' | 'disable' | 'installHelper' | 'uninstallHelper'>
  fanProfiles: Pick<FanProfileService, 'getProfiles' | 'applyProfile' | 'saveCurrentProfile' | 'removeProfile'>
  fanCalibration: Pick<FanCalibrationService, 'getState' | 'start' | 'cancel' | 'clear'>
  /** SMAppService builds: open System Settings › Login Items for the helper's approval. */
  openHelperApproval?: () => Promise<void>
}

type Result<T> = { success: true; state: T } | { success: false; error: string }

async function fanCall<T>(work: () => Promise<T>, fallback = 'The fan command failed.'): Promise<Result<T>> {
  try {
    return { success: true, state: await work() }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : fallback }
  }
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

  // Fan control: every command is validated here and executed by the service through the helper.
  ipcMain.handle(THERMAL_CHANNELS.invoke.fanGetState, () => ({ success: true, state: target.fanControl.getState() }))
  ipcMain.handle(THERMAL_CHANNELS.invoke.fanEnable, () => fanCall(() => target.fanControl.enable()))
  ipcMain.handle(THERMAL_CHANNELS.invoke.fanSet, (_event, fanId: unknown, command: unknown) => {
    if (typeof fanId !== 'string' || fanId.length === 0 || fanId.length > 64) return { success: false, error: 'Invalid fan id.' }
    if (!isFanCommand(command)) return { success: false, error: 'Invalid fan command.' }
    console.info(`[Thermal] fan command from renderer: ${fanId} ${JSON.stringify(command)}`)
    return fanCall(() => target.fanControl.setFan(fanId, command))
  })
  ipcMain.handle(THERMAL_CHANNELS.invoke.fanRestoreAll, () => fanCall(() => target.fanControl.restoreAll()))
  ipcMain.handle(THERMAL_CHANNELS.invoke.fanDisable, () => fanCall(() => target.fanControl.disable()))
  ipcMain.handle(THERMAL_CHANNELS.invoke.fanInstallHelper, () => fanCall(() => target.fanControl.installHelper(), 'The fan helper could not be installed.'))
  ipcMain.handle(THERMAL_CHANNELS.invoke.fanUninstallHelper, () => fanCall(() => target.fanControl.uninstallHelper(), 'The fan helper could not be removed.'))
  ipcMain.handle(THERMAL_CHANNELS.invoke.fanOpenHelperApproval, async () => {
    if (!target.openHelperApproval) return { success: false, error: 'This build has no helper to approve.' }
    try {
      await target.openHelperApproval()
      return { success: true }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'System Settings could not be opened.' }
    }
  })

  // Profiles: ids are `builtin:…` or `user:…`; names are bounded; everything else is the service's business.
  ipcMain.handle(THERMAL_CHANNELS.invoke.fanProfilesGet, () => ({ success: true, state: target.fanProfiles.getProfiles() }))
  ipcMain.handle(THERMAL_CHANNELS.invoke.fanProfilesApply, (_event, id: unknown) => {
    if (typeof id !== 'string' || !(id.startsWith('builtin:') || isUserFanProfileId(id)) || id.length > 80) return { success: false, error: 'Invalid profile id.' }
    return fanCall(() => target.fanProfiles.applyProfile(id), 'The profile could not be applied.')
  })
  ipcMain.handle(THERMAL_CHANNELS.invoke.fanProfilesSave, (_event, name: unknown) => {
    if (!isValidFanProfileName(name)) return { success: false, error: `Give the profile a name of up to ${MAX_FAN_PROFILE_NAME_LENGTH} characters.` }
    return fanCall(() => target.fanProfiles.saveCurrentProfile(name), 'The profile could not be saved.')
  })
  ipcMain.handle(THERMAL_CHANNELS.invoke.fanProfilesRemove, (_event, id: unknown) => {
    if (!isUserFanProfileId(id)) return { success: false, error: 'Invalid profile id.' }
    return fanCall(() => target.fanProfiles.removeProfile(id), 'The profile could not be deleted.')
  })

  // Calibration: no arguments; the service refuses to start without a ready helper.
  ipcMain.handle(THERMAL_CHANNELS.invoke.fanCalibrationGet, () => ({ success: true, state: target.fanCalibration.getState() }))
  ipcMain.handle(THERMAL_CHANNELS.invoke.fanCalibrationStart, () => fanCall(() => target.fanCalibration.start(), 'Calibration could not start.'))
  ipcMain.handle(THERMAL_CHANNELS.invoke.fanCalibrationCancel, () => fanCall(() => target.fanCalibration.cancel(), 'Calibration could not be cancelled.'))
  ipcMain.handle(THERMAL_CHANNELS.invoke.fanCalibrationClear, () => ({ success: true, state: target.fanCalibration.clear() }))
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
    fanState: (state: FanControlState) => sendToWindow(getMainWindow, THERMAL_CHANNELS.event.fanState, state),
    fanProfilesState: (state: FanProfilesState) => sendToWindow(getMainWindow, THERMAL_CHANNELS.event.fanProfilesState, state),
    fanCalibrationState: (state: FanCalibrationState) => sendToWindow(getMainWindow, THERMAL_CHANNELS.event.fanCalibrationState, state),
  }
}
