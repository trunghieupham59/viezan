/**
 * Wire the thermal module for this process: pick the platform reader, attach CPU
 * load, pause while the main window is not visible, push snapshots to it, keep the
 * menu bar / tray reading in sync with the module settings, and own the fan control
 * service that talks to the privileged helper.
 *
 * `start`/`stop` are the module host's lifecycle: the tray item exists only while the
 * module is on, and stopping releases the reader so nothing runs in the background.
 */
import * as path from 'node:path'
import type { BrowserWindow, Tray } from 'electron'
import type { FanControlState, ThermalSettings, ThermalSupport } from '../../shared/thermalApi'
import { createHelperClient } from '../helper/client'
import { launchWithAdministratorPrivileges } from '../helper/launch'
import { createCpuLoadSampler } from './cpuLoad'
import { createFanCalibration, type FanCalibrationService } from './fanCalibration'
import { createFanControlService } from './fanControl'
import type { FanControlService } from './fanControlTypes'
import { createFanPolicy, type FanPolicyService } from './fanPolicy'
import { createFanProfileService, type FanProfileService } from './fanProfiles'
import { createHwmonReader } from './hwmonReader'
import { createThermalBroadcaster } from './ipc'
import { unsupportedReader } from './reader'
import { createThermalService, type ThermalService } from './service'
import { createThermalSettingsStore, loadThermalSettings, saveThermalSettings, THERMAL_SETTINGS_FILE, type ThermalSettingsStore } from './settingsStore'
import { createSmcReader, resolveSmcBinaryPath, SMC_BINARY_NAME } from './smcReader'
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
  /** The current user's uid; the privileged helper accepts only this peer. */
  uid: number
  /** Suffix for the helper socket so a dev run and the release never share a helper (`-dev` or empty). */
  helperSocketSuffix: string
}

export const FAN_HELPER_BINARY_NAME = 'viezan-fan-helper'
export const FAN_HELPER_SOCKET_PREFIX = '/var/run/viezan-fan-helper'

/** Where the fan helper lives: beside `viezan-smc`. */
export function resolveFanHelperPath(options: { isPackaged: boolean; resourcesPath: string; appPath: string }): string {
  return resolveSmcBinaryPath(options).replace(new RegExp(`${SMC_BINARY_NAME}$`), FAN_HELPER_BINARY_NAME)
}

export interface ThermalRuntime {
  service: ThermalService
  settings: ThermalSettingsStore
  tray: ThermalTrayController
  /** Profiles over policy (sensor mode) over the helper bridge; what IPC and the capability use. */
  fanControl: FanControlService
  fanProfiles: FanProfileService
  fanCalibration: FanCalibrationService
  /** Reader support plus the tray placement for this run. */
  getSupport: () => ThermalSupport
  /** Module host `start`: restore the tray reading from the saved settings. */
  start: () => void
  /** Module host `stop`: fans back to auto, hide the tray reading, release the reader. */
  stop: () => Promise<void>
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

  // Three consumers want readings while the window is hidden: the tray item, sensor-driven fans, a running calibration.
  const background = { tray: false, fans: false, calibration: false }
  const syncBackground = () => service.setBackgroundMonitoring(background.tray || background.fans || background.calibration)

  let started = false
  function applyTray(next: ThermalSettings) {
    if (!started) return
    const show = next.tray.enabled && service.getSupport().supported && tray.placement() !== 'none'
    tray.apply({ ...next.tray, enabled: show })
    background.tray = show
    syncBackground()
  }

  service.subscribe((snapshot) => tray.update(snapshot))
  settings.subscribe((next) => {
    applyTray(next)
    broadcaster.settingsChanged(next)
  })

  let fanPolicy: FanPolicyService | null = null
  let fanProfiles: FanProfileService | null = null
  let fanCalibration: FanCalibrationService | null = null
  const fanBridge = createFanControlService({
    platform: deps.platform,
    helperBinaryPath: resolveFanHelperPath(deps),
    socketPath: `${FAN_HELPER_SOCKET_PREFIX}-${deps.uid}${deps.helperSocketSuffix}.sock`,
    uid: deps.uid,
    launch: launchWithAdministratorPrivileges,
    createClient: (socketPath: string) => createHelperClient({ socketPath }),
    onState: (state: FanControlState) => fanPolicy?.ingestControlState(state),
  })
  fanPolicy = createFanPolicy({
    control: fanBridge,
    subscribeSnapshots: service.subscribe,
    setBackgroundReads: (active) => { background.fans = active; syncBackground() },
    affinity: (fanKey) => fanCalibration?.affinitySensors(fanKey) ?? null,
    onState: (state) => {
      fanProfiles?.ingestControlState(state)
      broadcaster.fanState(state)
    },
  })
  fanProfiles = createFanProfileService({
    control: fanPolicy,
    settings,
    onState: broadcaster.fanProfilesState,
  })
  fanCalibration = createFanCalibration({
    control: fanProfiles,
    subscribeSnapshots: service.subscribe,
    setBackgroundReads: (active) => { background.calibration = active; syncBackground() },
    saveResult: (result) => { settings.update({ fanAffinity: result }) },
    loadResult: () => settings.get().fanAffinity,
    onState: broadcaster.fanCalibrationState,
  })
  const fanControl: FanControlService = fanProfiles

  return {
    service,
    settings,
    tray,
    fanControl,
    fanProfiles,
    fanCalibration,
    getSupport: () => {
      const support = service.getSupport()
      return support.supported ? { ...support, trayPlacement: tray.placement() } : support
    },
    start: () => {
      started = true
      applyTray(settings.get())
    },
    stop: async () => {
      started = false
      // Fans first: the helper must see the restore before anything else winds down.
      await fanCalibration?.cancel()
      await fanControl.stop()
      tray.dispose()
      service.stop()
    },
  }
}
