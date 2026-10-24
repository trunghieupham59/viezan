/**
 * What the menu bar / tray shows for a snapshot. Pure so the wording is unit-tested.
 *
 * The title is deliberately terse (a menu bar has room for a few characters):
 * `61°` or `61° 2374` with the fastest fan. The tooltip spells it out.
 */
import type { ThermalFan, ThermalSensor, ThermalSnapshot, ThermalTrayMetric, ThermalTraySettings } from '../../shared/thermalApi'

function hottestOf(sensors: readonly ThermalSensor[]): ThermalSensor | null {
  return sensors.reduce<ThermalSensor | null>((best, sensor) => (!best || sensor.celsius > best.celsius ? sensor : best), null)
}

/** The sensor a metric points at; CPU/GPU fall back to the hottest sensor when the group is empty. */
export function pickTraySensor(snapshot: Pick<ThermalSnapshot, 'sensors'>, metric: ThermalTrayMetric): ThermalSensor | null {
  if (metric === 'cpu' || metric === 'gpu') {
    const inGroup = hottestOf(snapshot.sensors.filter((sensor) => sensor.group === metric))
    if (inGroup) return inGroup
  }
  return hottestOf(snapshot.sensors)
}

export function fastestFan(fans: readonly ThermalFan[]): ThermalFan | null {
  return fans.reduce<ThermalFan | null>((best, fan) => (!best || fan.rpm > best.rpm ? fan : best), null)
}

/** Short status-item text. Empty when there is nothing to show. */
export function formatTrayTitle(snapshot: Pick<ThermalSnapshot, 'sensors' | 'fans'>, settings: Pick<ThermalTraySettings, 'metric' | 'showFan'>): string {
  const sensor = pickTraySensor(snapshot, settings.metric)
  const parts: string[] = []
  if (sensor) parts.push(`${Math.round(sensor.celsius)}°`)
  if (settings.showFan) {
    const fan = fastestFan(snapshot.fans)
    if (fan) parts.push(String(fan.rpm))
  }
  return parts.join(' ')
}

const METRIC_NAMES: Record<ThermalTrayMetric, string> = { hottest: 'Max', cpu: 'CPU', gpu: 'GPU' }

/** One line per fact, language-neutral (sensor codes and units), prefixed with the app title. */
export function formatTrayTooltip(
  appTitle: string,
  snapshot: Pick<ThermalSnapshot, 'sensors' | 'fans' | 'cpuLoadPercent'>,
  settings: Pick<ThermalTraySettings, 'metric' | 'showFan'>,
): string {
  const lines = [appTitle]
  const sensor = pickTraySensor(snapshot, settings.metric)
  if (sensor) lines.push(`${METRIC_NAMES[settings.metric]} ${sensor.celsius.toFixed(1)}°C (${sensor.code})`)
  if (settings.showFan) {
    for (const fan of snapshot.fans) lines.push(`${fan.name ?? `Fan ${fan.index + 1}`}: ${fan.rpm} RPM`)
  }
  if (snapshot.cpuLoadPercent !== undefined) lines.push(`CPU ${snapshot.cpuLoadPercent}%`)
  return lines.join('\n')
}
