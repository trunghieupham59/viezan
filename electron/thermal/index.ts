/**
 * Wire the thermal module for this process: pick the platform reader, attach CPU
 * load, pause while the main window is not visible, push snapshots to it, and keep
 * the menu bar / tray reading in sync with the module settings.
 *
 * `start`/`stop` are the module host's lifecycle: the tray item exists only while the
 * module is on, and stopping releases the reader so nothing runs in the background.
 */
import * as path from 'node:path'
import type { BrowserWindow, Tray } from 'electron'
import type { ThermalSettings, ThermalSupport } from '../../shared/thermalApi'
import { createCpuLoadSampler } from './cpuLoad'
import { createHwmonReader } from './hwmonReader'
import { createThermalBroadcaster } from './ipc'
import { unsupportedReader } from './reader'
import { createThermalService, type ThermalService } from './service'
import { createThermalSettingsStore, loadThermalSettings, saveThermalSettings, THERMAL_SETTINGS_FILE, type ThermalSettingsStore } from './settingsStore'
import { createSmcReader, resolveSmcBinaryPath } from './smcReader'
import { createThermalTrayController, type StatusItem, type ThermalTrayController } from './tray'

export interface ThermalRuntimeDeps {
  platform: NodeJS.Platform
  isPackaged: boolean
  resourcesPath: string
  appPath: string
  userDataPath: string
  /** Title for the status item / tray tooltip ("Viezan", "Viezan (Dev)"). */
  appTitle: string
  getMainWindow: () => BrowserWindow | null
  /** The Windows/Linux residency tray, when this run has one. */
  getAppTray: () => Tray | null
  /** macOS: build the status item with its context menu (open window, hide reading). */
  createStatusItem: (actions: { onHide: () => void }) => StatusItem
}

export interface ThermalRuntime {
  service: ThermalService
  settings: ThermalSettingsStore
  tray: ThermalTrayController
  /** Reader support plus the tray placement for this run. */
  getSupport: () => ThermalSupport
  /** Module host `start`: restore the tray reading from the saved settings. */
  start: () => void
  /** Module host `stop`: hide the tray reading and release the reader. */
  stop: () => void
}

export function createPlatformThermalReader(deps: Pick<ThermalRuntimeDeps, 'platform' | 'isPackaged' | 'resourcesPath' | 'appPath'>) {
  if (deps.platform === 'darwin') {
    return createSmcReader({ binaryPath: resolveSmcBinaryPath(deps) })
  }
  if (deps.platform === 'linux') return createHwmonReader()
  return unsupportedReader(deps.platform)
}

export function createThermalRuntime(deps: ThermalRuntimeDeps): ThermalRuntime {
  const broadcaster = createThermalBroadcaster(deps.getMainWindow)
  const cpuLoad = createCpuLoadSampler()
  const service = createThermalService({
    reader: createPlatformThermalReader(deps),
    sampleCpuLoad: () => cpuLoad.sample(),
    isPaused: () => {
      const win = deps.getMainWindow()
      return !win || win.isDestroyed() || !win.isVisible() || win.isMinimized()
    },
    onSnapshot: broadcaster.snapshot,
    onError: broadcaster.error,
  })

  const settingsFile = path.join(deps.userDataPath, THERMAL_SETTINGS_FILE)
  const settings = createThermalSettingsStore({
    load: () => loadThermalSettings(settingsFile),
    save: (next) => saveThermalSettings(settingsFile, next),
  })

  const tray = createThermalTrayController({
    platform: deps.platform,
    appTitle: deps.appTitle,
    createStatusItem: () => deps.createStatusItem({ onHide: () => { settings.update({ tray: { enabled: false } }) } }),
    getAppTray: deps.getAppTray,
  })

  let started = false
  function applyTray(next: ThermalSettings) {
    if (!started) return
    const show = next.tray.enabled && service.getSupport().supported && tray.placement() !== 'none'
    tray.apply({ ...next.tray, enabled: show })
    service.setBackgroundMonitoring(show)
  }

  service.subscribe((snapshot) => tray.update(snapshot))
  settings.subscribe((next) => {
    applyTray(next)
    broadcaster.settingsChanged(next)
  })

  return {
    service,
    settings,
    tray,
    getSupport: () => {
      const support = service.getSupport()
      return support.supported ? { ...support, trayPlacement: tray.placement() } : support
    },
    start: () => {
      started = true
      applyTray(settings.get())
    },
    stop: () => {
      started = false
      tray.dispose()
      service.stop()
    },
  }
}
