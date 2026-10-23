import type { ThermalSensor } from '../../../../shared/thermalApi'
import { ThermalReadingTile, type ThermalReadingTone } from '../../ui/molecules'

export interface ThermalSensorGroupProps {
  title: string
  sensors: readonly ThermalSensor[]
  history: Readonly<Record<string, readonly number[]>>
  /** Localized label for a sensor's `label` id; falls back to its name or code. */
  labelFor: (sensor: ThermalSensor) => string
  historyLabel: string
  formatCelsius: (celsius: number) => string
}

/** Temperatures above these marks are shown as warm and hot. */
export const THERMAL_WARM_CELSIUS = 70
export const THERMAL_HOT_CELSIUS = 90
/** Scale of the level bar: 100 °C fills it. */
const THERMAL_BAR_MAX_CELSIUS = 100

export function thermalTone(celsius: number): ThermalReadingTone {
  if (celsius >= THERMAL_HOT_CELSIUS) return 'hot'
  if (celsius >= THERMAL_WARM_CELSIUS) return 'warm'
  return 'ok'
}

/** One group (CPU, GPU, other) of temperature tiles, hottest first. */
export function ThermalSensorGroup({ title, sensors, history, labelFor, historyLabel, formatCelsius }: ThermalSensorGroupProps) {
  if (sensors.length === 0) return null
  const ordered = [...sensors].sort((a, b) => b.celsius - a.celsius)
  return (
    <section className="thermal-group" aria-label={title}>
      <h2 className="thermal-group__title">
        {title}
        <span className="thermal-group__count">{sensors.length}</span>
      </h2>
      <div className="thermal-grid">
        {ordered.map((sensor) => (
          <ThermalReadingTile
            key={sensor.id}
            label={labelFor(sensor)}
            code={sensor.code}
            value={formatCelsius(sensor.celsius)}
            level={sensor.celsius / THERMAL_BAR_MAX_CELSIUS}
            tone={thermalTone(sensor.celsius)}
            history={history[sensor.id]}
            historyLabel={`${labelFor(sensor)} · ${historyLabel}`}
          />
        ))}
      </div>
    </section>
  )
}
