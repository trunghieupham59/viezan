/**
 * Thermal API — temperature sensors and fan speeds, read without privileges (macOS via
 * the bundled `viezan-smc` reader, Linux via sysfs hwmon). Single source for
 * `window.api.thermal`. Fan *control* is a later phase and a separate capability.
 */

export type ThermalSensorGroup = 'cpu' | 'gpu' | 'other'

export type ThermalSource = 'smc' | 'hwmon'

/**
 * Stable label ids for sensors whose meaning is known; the renderer localizes them.
 * Sensors without a known label show their `code` (an SMC key such as `Tp01`, or the
 * hwmon chip and channel).
 */
export type ThermalSensorLabel =
  | 'cpu-core'
  | 'cpu-performance-core'
  | 'cpu-efficiency-core'
  | 'cpu-die'
  | 'cpu-proximity'
  | 'cpu-package'
  | 'gpu'
  | 'gpu-die'
  | 'gpu-proximity'
  | 'memory'
  | 'battery'
  | 'wifi'
  | 'airflow-left'
  | 'airflow-right'
  | 'palm-rest'
  | 'storage'
  | 'ambient'
  | 'display'
  | 'power'
  | 'thunderbolt'
  | 'skin'

export interface ThermalSensor {
  /** Unique within a snapshot and stable across snapshots from the same machine. */
  id: string
  /** The raw identifier: SMC key, or `chip/channel` on hwmon. */
  code: string
  group: ThermalSensorGroup
  label?: ThermalSensorLabel
  /** Free-text name the driver reported (hwmon `temp*_label`), when there is one. */
  name?: string
  celsius: number
}

export interface ThermalFan {
  id: string
  /** Zero-based position among the machine's fans. */
  index: number
  name?: string
  rpm: number
  minRpm?: number
  maxRpm?: number
  targetRpm?: number
}

export interface ThermalSnapshot {
  /** Milliseconds since the epoch, taken when the reader produced the values. */
  timestamp: number
  source: ThermalSource
  sensors: ThermalSensor[]
  fans: ThermalFan[]
  /** Whole-machine CPU busy time since the previous sample, 0–100. Absent on the first sample. */
  cpuLoadPercent?: number
}

export type ThermalUnsupportedReason = 'unsupported-platform' | 'reader-missing' | 'no-sensors'

export interface ThermalSupport {
  supported: boolean
  source?: ThermalSource
  reason?: ThermalUnsupportedReason
  /** Human-oriented hint for logs and the notice (e.g. the missing reader path). */
  detail?: string
}

export interface ThermalApi {
  getSupport: () => Promise<{ success: boolean; support?: ThermalSupport; error?: string }>
  /** One snapshot now. */
  read: () => Promise<{ success: boolean; snapshot?: ThermalSnapshot; error?: string }>
  /** Start or stop periodic snapshots pushed through `onSnapshot`. Stops by itself when the module is turned off. */
  setMonitoring: (active: boolean) => Promise<{ success: boolean; error?: string }>
  onSnapshot: (cb: (snapshot: ThermalSnapshot) => void) => () => void
  onError: (cb: (error: { message: string }) => void) => () => void
}
