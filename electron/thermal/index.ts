/**
 * Wire the thermal service for this process: pick the platform reader, attach CPU
 * load, pause while the main window is not visible, push snapshots to it.
 */
import type { BrowserWindow } from 'electron'
import { createCpuLoadSampler } from './cpuLoad'
import { createHwmonReader } from './hwmonReader'
import { createThermalBroadcaster } from './ipc'
import { unsupportedReader } from './reader'
import { createThermalService, type ThermalService } from './service'
import { createSmcReader, resolveSmcBinaryPath } from './smcReader'

export interface ThermalRuntimeDeps {
  platform: NodeJS.Platform
  isPackaged: boolean
  resourcesPath: string
  appPath: string
  getMainWindow: () => BrowserWindow | null
}

export function createPlatformThermalReader(deps: Omit<ThermalRuntimeDeps, 'getMainWindow'>) {
  if (deps.platform === 'darwin') {
    return createSmcReader({ binaryPath: resolveSmcBinaryPath(deps) })
  }
  if (deps.platform === 'linux') return createHwmonReader()
  return unsupportedReader(deps.platform)
}

export function createAppThermalService(deps: ThermalRuntimeDeps): ThermalService {
  const broadcaster = createThermalBroadcaster(deps.getMainWindow)
  const cpuLoad = createCpuLoadSampler()
  return createThermalService({
    reader: createPlatformThermalReader(deps),
    sampleCpuLoad: () => cpuLoad.sample(),
    isPaused: () => {
      const win = deps.getMainWindow()
      return !win || win.isDestroyed() || !win.isVisible() || win.isMinimized()
    },
    onSnapshot: broadcaster.snapshot,
    onError: broadcaster.error,
  })
}
