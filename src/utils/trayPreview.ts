import type { ThermalSensor, ThermalSnapshot, ThermalTrayPlacement, ThermalTraySettings } from '../../shared/thermalApi'
import { hottestSensor } from './thermalSensorRows'

/**
 * What the menu bar item will show for the current reading, for the preview in the
 * options popover. Mirrors `electron/thermal/trayTitle.ts` (which the main process
 * uses for the real item); keep the wording in step.
 */
export interface TrayPreview {
  temperature: string | null
  fan: string | null
  /** True when the item will be the two-line image rather than text. */
  stacked: boolean
}

/** `2374` → `2.4k`, `980` → `980`, `12500` → `12k`. */
export function shortRpm(rpm: number): string {
  if (rpm < 1000) return String(rpm)
  if (rpm >= 10_000) return `${Math.round(rpm / 1000)}k`
  return `${(rpm / 1000).toFixed(1)}k`
}

function pickSensor(sensors: readonly ThermalSensor[], metric: ThermalTraySettings['metric']): ThermalSensor | null {
  if (metric === 'cpu' || metric === 'gpu') {
    const inGroup = hottestSensor(sensors.filter((sensor) => sensor.group === metric))
    if (inGroup) return inGroup
  }
  return hottestSensor(sensors)
}

export function buildTrayPreview(snapshot: Pick<ThermalSnapshot, 'sensors' | 'fans'> | null, settings: ThermalTraySettings, placement: ThermalTrayPlacement): TrayPreview {
  const sensor = snapshot ? pickSensor(snapshot.sensors, settings.metric) : null
  const fan = snapshot && settings.showFan ? snapshot.fans.reduce<{ rpm: number } | null>((best, candidate) => (!best || candidate.rpm > best.rpm ? candidate : best), null) : null
  const temperature = sensor ? `${Math.round(sensor.celsius)}${settings.showUnit ? '°' : ''}` : null
  const fanText = fan ? (settings.fanFormat === 'short' ? shortRpm(fan.rpm) : String(fan.rpm)) : null
  return { temperature, fan: fanText, stacked: placement === 'menu-bar' && settings.layout === 'stacked' && settings.showFan && fanText !== null }
}
