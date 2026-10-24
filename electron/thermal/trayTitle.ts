/**
 * What the menu bar / tray shows for a snapshot. Pure so the wording is unit-tested.
 *
 * The title is deliberately terse (a menu bar has room for a few characters):
 * `61°` or `61° 2374` with the fastest fan, or `61 2.4k` with the unit off and the
 * fan shortened. The stacked layout draws the same two parts on two lines. The
 * tooltip spells it out. `src/utils/trayPreview.ts` mirrors the wording for the
 * settings preview; keep the two in step.
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

/** `2374` → `2.4k`, `980` → `980`, `12500` → `12k`. */
export function shortRpm(rpm: number): string {
  if (rpm < 1000) return String(rpm)
  if (rpm >= 10_000) return `${Math.round(rpm / 1000)}k`
  return `${(rpm / 1000).toFixed(1)}k`
}

export interface TrayParts {
  /** `61°` (or `61` without the unit); null when no sensor is readable. */
  temperature: string | null
  /** The fastest fan, only when asked for; null otherwise. */
  fan: string | null
}

/** The two things the item can show, formatted per the settings. */
export function formatTrayParts(snapshot: Pick<ThermalSnapshot, 'sensors' | 'fans'>, settings: Pick<ThermalTraySettings, 'metric' | 'showFan' | 'showUnit' | 'fanFormat'>): TrayParts {
  const sensor = pickTraySensor(snapshot, settings.metric)
  const fan = settings.showFan ? fastestFan(snapshot.fans) : null
  return {
    temperature: sensor ? `${Math.round(sensor.celsius)}${settings.showUnit ? '°' : ''}` : null,
    fan: fan ? (settings.fanFormat === 'short' ? shortRpm(fan.rpm) : String(fan.rpm)) : null,
  }
}

/** Short status-item text (the inline layout). Empty when there is nothing to show. */
export function formatTrayTitle(snapshot: Pick<ThermalSnapshot, 'sensors' | 'fans'>, settings: Pick<ThermalTraySettings, 'metric' | 'showFan' | 'showUnit' | 'fanFormat'>): string {
  const parts = formatTrayParts(snapshot, settings)
  return [parts.temperature, parts.fan].filter((part): part is string => part !== null).join(' ')
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
