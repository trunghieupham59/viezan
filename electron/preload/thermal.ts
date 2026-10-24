/**
 * Thermal preload API — sensors and fan speeds. Shape: `shared/thermalApi.d.ts`.
 */
import type { ThermalApi } from '../../shared/thermalApi'
import { THERMAL_CHANNELS } from '../ipc/channels'
import { invoke, subscribe } from './contract'

export const thermalApi: ThermalApi = {
  getSupport: invoke(THERMAL_CHANNELS.invoke.getSupport),
  read: invoke(THERMAL_CHANNELS.invoke.read),
  setMonitoring: invoke(THERMAL_CHANNELS.invoke.setMonitoring),
  onSnapshot: subscribe(THERMAL_CHANNELS.event.snapshot),
  onError: subscribe(THERMAL_CHANNELS.event.error),
  getSettings: invoke(THERMAL_CHANNELS.invoke.getSettings),
  updateSettings: invoke(THERMAL_CHANNELS.invoke.updateSettings),
  onSettingsChanged: subscribe(THERMAL_CHANNELS.event.settingsChanged),
  fanControl: {
    getState: invoke(THERMAL_CHANNELS.invoke.fanGetState),
    enable: invoke(THERMAL_CHANNELS.invoke.fanEnable),
    setFan: invoke(THERMAL_CHANNELS.invoke.fanSet),
    restoreAll: invoke(THERMAL_CHANNELS.invoke.fanRestoreAll),
    disable: invoke(THERMAL_CHANNELS.invoke.fanDisable),
    onState: subscribe(THERMAL_CHANNELS.event.fanState),
    profiles: {
      get: invoke(THERMAL_CHANNELS.invoke.fanProfilesGet),
      apply: invoke(THERMAL_CHANNELS.invoke.fanProfilesApply),
      saveCurrent: invoke(THERMAL_CHANNELS.invoke.fanProfilesSave),
      remove: invoke(THERMAL_CHANNELS.invoke.fanProfilesRemove),
      onState: subscribe(THERMAL_CHANNELS.event.fanProfilesState),
    },
    calibration: {
      get: invoke(THERMAL_CHANNELS.invoke.fanCalibrationGet),
      start: invoke(THERMAL_CHANNELS.invoke.fanCalibrationStart),
      cancel: invoke(THERMAL_CHANNELS.invoke.fanCalibrationCancel),
      clear: invoke(THERMAL_CHANNELS.invoke.fanCalibrationClear),
      onState: subscribe(THERMAL_CHANNELS.event.fanCalibrationState),
    },
  },
}

export const thermalSection = { thermal: thermalApi }
