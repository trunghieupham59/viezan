// @vitest-environment node

import type { IpcMain } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import type { FanControlState } from '../../../shared/thermalApi'
import { THERMAL_CHANNELS } from '../../ipc/channels'
import { createFanWriteCapability } from '../../ipc/systemCapabilities'
import { appFanId, helperFanId, isFanCommand } from '../fanControlTypes'
import { registerThermalHandlers } from '../ipc'
import { DEFAULT_THERMAL_SETTINGS } from '../settingsStore'

type Handler = (event: unknown, ...args: unknown[]) => unknown

function fakeIpcMain() {
  const handlers = new Map<string, Handler>()
  const ipcMain = { handle: vi.fn((channel: string, handler: Handler) => { handlers.set(channel, handler) }) } as unknown as IpcMain
  const invoke = (channel: string, ...args: unknown[]) => handlers.get(channel)?.({}, ...args)
  return { ipcMain, invoke }
}

const ready: FanControlState = {
  helper: 'ready', helperVersion: '1.0.0',
  fans: [{ id: 'smc:fan0', index: 0, mode: 'auto', minRpm: 1499, maxRpm: 5348, currentRpm: 1900 }],
}

function fakeFanControl(state: FanControlState = ready) {
  return {
    getState: vi.fn(() => state),
    enable: vi.fn(async () => state),
    setFan: vi.fn(async () => state),
    restoreAll: vi.fn(async () => state),
    disable: vi.fn(async () => ({ helper: 'idle', fans: [] }) as FanControlState),
    installHelper: vi.fn(async () => ({ ...state, install: 'installed' }) as FanControlState),
    uninstallHelper: vi.fn(async () => ({ helper: 'idle', install: 'not-installed', fans: [] }) as FanControlState),
  }
}

describe('fan control IPC', () => {
  it('validates fan commands before the service sees them and maps service errors to results', async () => {
    const { ipcMain, invoke } = fakeIpcMain()
    const fanControl = fakeFanControl()
    const profilesState = { activeId: null, applied: false, profiles: [] }
    const calibrationState = { status: 'idle' as const }
    const calibration = {
      getState: vi.fn(() => calibrationState),
      start: vi.fn(async () => ({ ...calibrationState, status: 'running' as const })),
      cancel: vi.fn(async () => calibrationState),
      clear: vi.fn(() => calibrationState),
    }
    const profiles = {
      getProfiles: vi.fn(() => profilesState),
      applyProfile: vi.fn(async () => profilesState),
      saveCurrentProfile: vi.fn(async () => profilesState),
      removeProfile: vi.fn(async () => profilesState),
    }
    registerThermalHandlers(ipcMain, {
      service: { read: vi.fn(), setMonitoring: vi.fn() },
      settings: { get: () => DEFAULT_THERMAL_SETTINGS, update: () => DEFAULT_THERMAL_SETTINGS },
      getSupport: () => ({ supported: true, source: 'smc' }),
      fanControl,
      fanProfiles: profiles,
      fanCalibration: calibration,
    })

    expect(await invoke(THERMAL_CHANNELS.invoke.fanGetState)).toEqual({ success: true, state: ready })
    expect(await invoke(THERMAL_CHANNELS.invoke.fanSet, 'smc:fan0', { mode: 'fixed', rpm: 2500 })).toEqual({ success: true, state: ready })
    expect(fanControl.setFan).toHaveBeenCalledWith('smc:fan0', { mode: 'fixed', rpm: 2500 })

    expect(await invoke(THERMAL_CHANNELS.invoke.fanSet, 'smc:fan0', { mode: 'fixed', rpm: 'fast' })).toEqual({ success: false, error: 'Invalid fan command.' })
    expect(await invoke(THERMAL_CHANNELS.invoke.fanSet, 'smc:fan0', { mode: 'curve' })).toEqual({ success: false, error: 'Invalid fan command.' })
    expect(await invoke(THERMAL_CHANNELS.invoke.fanSet, 7, { mode: 'auto' })).toEqual({ success: false, error: 'Invalid fan id.' })
    expect(fanControl.setFan).toHaveBeenCalledTimes(1)

    fanControl.setFan.mockRejectedValueOnce(new Error('Target 9000 RPM is outside 1499–5348 RPM.'))
    expect(await invoke(THERMAL_CHANNELS.invoke.fanSet, 'smc:fan0', { mode: 'fixed', rpm: 9000 })).toEqual({ success: false, error: 'Target 9000 RPM is outside 1499–5348 RPM.' })

    expect(await invoke(THERMAL_CHANNELS.invoke.fanRestoreAll)).toEqual({ success: true, state: ready })
    expect(await invoke(THERMAL_CHANNELS.invoke.fanDisable)).toEqual({ success: true, state: { helper: 'idle', fans: [] } })
    expect(await invoke(THERMAL_CHANNELS.invoke.fanEnable)).toEqual({ success: true, state: ready })
    expect(await invoke(THERMAL_CHANNELS.invoke.fanInstallHelper)).toEqual({ success: true, state: { ...ready, install: 'installed' } })
    expect(await invoke(THERMAL_CHANNELS.invoke.fanUninstallHelper)).toEqual({ success: true, state: { helper: 'idle', install: 'not-installed', fans: [] } })
    // Only SMAppService builds have an approval to open.
    expect(await invoke(THERMAL_CHANNELS.invoke.fanOpenHelperApproval)).toEqual({ success: false, error: 'This build has no helper to approve.' })

    expect(await invoke(THERMAL_CHANNELS.invoke.fanProfilesApply, 'builtin:quiet')).toEqual({ success: true, state: profilesState })
    expect(await invoke(THERMAL_CHANNELS.invoke.fanProfilesApply, 'evil:x')).toEqual({ success: false, error: 'Invalid profile id.' })
    expect(await invoke(THERMAL_CHANNELS.invoke.fanProfilesSave, '   ')).toMatchObject({ success: false })
    expect(await invoke(THERMAL_CHANNELS.invoke.fanProfilesSave, 'Gaming night')).toEqual({ success: true, state: profilesState })
    expect(await invoke(THERMAL_CHANNELS.invoke.fanProfilesRemove, 'builtin:quiet')).toEqual({ success: false, error: 'Invalid profile id.' })
    expect(await invoke(THERMAL_CHANNELS.invoke.fanProfilesRemove, 'user:abc')).toEqual({ success: true, state: profilesState })

    expect(await invoke(THERMAL_CHANNELS.invoke.fanCalibrationGet)).toEqual({ success: true, state: calibrationState })
    expect(await invoke(THERMAL_CHANNELS.invoke.fanCalibrationStart)).toEqual({ success: true, state: { status: 'running' } })
    calibration.start.mockRejectedValueOnce(new Error('Fan control is not connected.'))
    expect(await invoke(THERMAL_CHANNELS.invoke.fanCalibrationStart)).toEqual({ success: false, error: 'Fan control is not connected.' })
    expect(await invoke(THERMAL_CHANNELS.invoke.fanCalibrationClear)).toEqual({ success: true, state: calibrationState })
  })

  it('maps fan ids both ways and recognises commands', () => {
    expect(appFanId('fan1')).toBe('smc:fan1')
    expect(helperFanId('smc:fan1')).toBe('fan1')
    expect(helperFanId('hwmon:fan1')).toBeNull()
    expect(isFanCommand({ mode: 'auto' })).toBe(true)
    expect(isFanCommand({ mode: 'fixed', rpm: 1800 })).toBe(true)
    expect(isFanCommand({ mode: 'fixed', rpm: Number.NaN })).toBe(false)
    expect(isFanCommand({ mode: 'fixed' })).toBe(false)
    expect(isFanCommand(null)).toBe(false)
    expect(isFanCommand({ mode: 'sensor', sensorId: 'smc:Tp01', minCelsius: 50, maxCelsius: 90 })).toBe(true)
    expect(isFanCommand({ mode: 'sensor', sensorId: 'smc:Tp01', minCelsius: 90, maxCelsius: 50 })).toBe(false)
    expect(isFanCommand({ mode: 'sensor', sensorId: '', minCelsius: 50, maxCelsius: 90 })).toBe(false)
    expect(isFanCommand({ mode: 'sensor', sensorId: 'smc:Tp01', minCelsius: 10, maxCelsius: 90 })).toBe(false)
  })

  it('exposes the helper as the thermal.fan.write capability', async () => {
    const states: FanControlState[] = [{ helper: 'idle', fans: [] }, ready]
    const fanControl = { getState: () => states[0], enable: vi.fn(async () => states[1]) }
    const capability = createFanWriteCapability(fanControl)
    expect(await capability.get()).toEqual({ id: 'thermal.fan.write', supported: true, permission: 'denied', detail: { helper: 'idle' } })
    expect(await capability.request?.()).toEqual({ id: 'thermal.fan.write', supported: true, permission: 'granted', detail: { helper: 'ready', helperVersion: '1.0.0' } })

    const missing = createFanWriteCapability({ getState: () => ({ helper: 'missing', fans: [] }), enable: vi.fn() })
    expect(await missing.get()).toMatchObject({ supported: false, permission: 'denied' })
  })
})
