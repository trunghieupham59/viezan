import type { ThermalSensor, ThermalSensorGroup, ThermalSensorLabel } from '../../shared/thermalApi'

/**
 * One line of the sensor table: every raw sensor that means the same thing (all
 * performance cores, every battery cell, …) folded into a single row that shows the
 * hottest reading, with the raw sensors available on demand. A Mac exposes hundreds
 * of SMC keys; a dozen rows is what a person can read.
 */
export interface ThermalSensorRow {
  id: string
  group: ThermalSensorGroup
  /** Known meaning, localized by the caller. */
  label?: ThermalSensorLabel
  /** Driver-reported name (Linux hwmon), used as the title when there is no label. */
  name?: string
  /** Keys the classifier could not name; shown as one collapsed row per group. */
  unlabeled: boolean
  /** Hottest reading in the row. */
  max: number
  avg: number
  count: number
  /** Members, hottest first. */
  sensors: ThermalSensor[]
}

export const THERMAL_GROUPS: readonly ThermalSensorGroup[] = ['cpu', 'gpu', 'other']

/** Temperatures above these marks are shown as warm and hot. */
export const THERMAL_WARM_CELSIUS = 70
export const THERMAL_HOT_CELSIUS = 90

export type ThermalTone = 'ok' | 'warm' | 'hot'

export function thermalTone(celsius: number): ThermalTone {
  if (celsius >= THERMAL_HOT_CELSIUS) return 'hot'
  if (celsius >= THERMAL_WARM_CELSIUS) return 'warm'
  return 'ok'
}

function rowKey(sensor: ThermalSensor): string {
  if (sensor.label) return `label:${sensor.label}`
  if (sensor.name) return `name:${sensor.name}`
  return 'unlabeled'
}

/** Fold a snapshot's sensors into rows per group, hottest row first, the unlabeled row last. */
export function buildSensorRows(sensors: readonly ThermalSensor[]): Record<ThermalSensorGroup, ThermalSensorRow[]> {
  const buckets = new Map<string, ThermalSensorRow>()
  for (const sensor of sensors) {
    const key = `${sensor.group}/${rowKey(sensor)}`
    let row = buckets.get(key)
    if (!row) {
      row = {
        id: `row:${key}`,
        group: sensor.group,
        ...(sensor.label ? { label: sensor.label } : {}),
        ...(!sensor.label && sensor.name ? { name: sensor.name } : {}),
        unlabeled: !sensor.label && !sensor.name,
        max: sensor.celsius,
        avg: 0,
        count: 0,
        sensors: [],
      }
      buckets.set(key, row)
    }
    row.sensors.push(sensor)
    row.count += 1
    if (sensor.celsius > row.max) row.max = sensor.celsius
  }
  const out: Record<ThermalSensorGroup, ThermalSensorRow[]> = { cpu: [], gpu: [], other: [] }
  for (const row of buckets.values()) {
    row.sensors.sort((a, b) => b.celsius - a.celsius)
    row.avg = Math.round((row.sensors.reduce((sum, sensor) => sum + sensor.celsius, 0) / row.count) * 10) / 10
    out[row.group].push(row)
  }
  for (const group of THERMAL_GROUPS) {
    out[group].sort((a, b) => (a.unlabeled === b.unlabeled ? b.max - a.max : a.unlabeled ? 1 : -1))
  }
  return out
}

/** The hottest sensor of a snapshot, or null when there is none. */
export function hottestSensor(sensors: readonly ThermalSensor[]): ThermalSensor | null {
  return sensors.reduce<ThermalSensor | null>((best, sensor) => (!best || sensor.celsius > best.celsius ? sensor : best), null)
}
