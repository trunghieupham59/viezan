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
}

export const thermalSection = { thermal: thermalApi }
