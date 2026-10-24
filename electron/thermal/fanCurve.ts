/**
 * Sensor-driven fan targets: the two-point rule Macs Fan Control users know. At or
 * below `minCelsius` the fan runs at its minimum, at or above `maxCelsius` at its
 * maximum, linear in between. Targets snap to a step and only change when they move
 * past a dead band, so the fan does not hunt on a reading that wobbles by a degree.
 * Pure functions; the policy service applies them on every snapshot.
 */
import type { FanSensorRule, ThermalSensor, ThermalSensorGroup } from '../../shared/thermalApi'

/** Rule bounds the UI and the validator share. */
export const FAN_SENSOR_MIN_CELSIUS = 20
export const FAN_SENSOR_MAX_CELSIUS = 110
/** Targets are multiples of this (also the slider step). */
export const FAN_TARGET_STEP_RPM = 50
/** A new target must differ from the applied one by at least this much to be sent. */
export const FAN_TARGET_DEADBAND_RPM = 100
/** Readings are smoothed over about this long before they drive a fan (an exponential average). */
export const FAN_SMOOTHING_MS = 10_000
/** A reading this far from the smoothed value is a real change: the average snaps to it. */
export const FAN_SMOOTHING_SNAP_CELSIUS = 8
/** Ordinary target changes are spaced at least this far apart; big ones (`FAN_TARGET_URGENT_RPM`) go through at once. */
export const FAN_TARGET_MIN_INTERVAL_MS = 6000
export const FAN_TARGET_URGENT_RPM = 400

/**
 * Smooth a temperature reading so a fan does not hunt on a value that wobbles by a
 * degree every poll: an exponential moving average with a time constant, except that
 * a jump beyond `snapCelsius` (real load arriving or leaving) resets the average.
 */
export function smoothCelsius(previous: number | undefined, reading: number, elapsedMs: number, timeConstantMs = FAN_SMOOTHING_MS, snapCelsius = FAN_SMOOTHING_SNAP_CELSIUS): number {
  if (previous === undefined || !Number.isFinite(previous)) return reading
  if (Math.abs(reading - previous) >= snapCelsius) return reading
  const alpha = 1 - Math.exp(-Math.max(0, elapsedMs) / timeConstantMs)
  return previous + alpha * (reading - previous)
}

/** Whether a target change may be sent now: urgent ones always, ordinary ones once per interval. */
export function targetChangeAllowed(lastChangeAt: number | undefined, now: number, appliedRpm: number | undefined, nextRpm: number, minIntervalMs = FAN_TARGET_MIN_INTERVAL_MS, urgentRpm = FAN_TARGET_URGENT_RPM): boolean {
  if (lastChangeAt === undefined || appliedRpm === undefined) return true
  if (Math.abs(nextRpm - appliedRpm) >= urgentRpm) return true
  return now - lastChangeAt >= minIntervalMs
}

export interface RpmRange {
  minRpm: number
  maxRpm: number
}

/**
 * A rule's source: `group:cpu` / `group:gpu` / `group:other` / `group:all` (hottest of
 * the group, or of the machine), `label:<label>` (hottest sensor with that meaning,
 * e.g. `label:cpu-performance-core`), or a raw sensor id (`smc:Tp01`, `hwmon:…`).
 */
export type FanSourceKind = 'group' | 'label' | 'affinity' | 'sensor'

const SOURCE_GROUPS: readonly string[] = ['cpu', 'gpu', 'other', 'all']

export function fanSourceKind(sourceId: string): FanSourceKind {
  if (sourceId.startsWith('group:')) return 'group'
  if (sourceId.startsWith('label:')) return 'label'
  if (sourceId.startsWith('affinity:')) return 'affinity'
  return 'sensor'
}

/** Sensors the calibration found a fan cools (`affinity:fanN` → `fanN`), or null when unknown. */
export type AffinityLookup = (fanKey: string) => string[] | null

export function isFanSourceId(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) return false
  if (value.startsWith('group:')) return SOURCE_GROUPS.includes(value.slice('group:'.length))
  if (value.startsWith('label:')) return /^label:[a-z][a-z-]{0,40}$/.test(value)
  if (value.startsWith('affinity:')) return /^affinity:fan\d{1,2}$/.test(value)
  return true
}

/** The reading a source stands for in a snapshot: the hottest matching sensor, or null when none matches. */
export function resolveFanSource(sensors: readonly ThermalSensor[], sourceId: string, affinity?: AffinityLookup): ThermalSensor | null {
  let matches: readonly ThermalSensor[]
  if (sourceId.startsWith('affinity:')) {
    const owned = affinity?.(sourceId.slice('affinity:'.length))
    // Not calibrated (yet): the hottest sensor of the machine keeps the fan sensible.
    matches = owned ? sensors.filter((sensor) => owned.includes(sensor.id)) : sensors
    if (owned && matches.length === 0) matches = sensors
  } else if (sourceId.startsWith('group:')) {
    const group = sourceId.slice('group:'.length)
    matches = group === 'all' ? sensors : sensors.filter((sensor) => sensor.group === (group as ThermalSensorGroup))
  } else if (sourceId.startsWith('label:')) {
    const label = sourceId.slice('label:'.length)
    matches = sensors.filter((sensor) => sensor.label === label)
  } else {
    matches = sensors.filter((sensor) => sensor.id === sourceId)
  }
  return matches.reduce<ThermalSensor | null>((best, sensor) => (!best || sensor.celsius > best.celsius ? sensor : best), null)
}

export function isFanSensorRule(value: unknown): value is FanSensorRule {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return isFanSourceId(row.sensorId)
    && typeof row.minCelsius === 'number' && Number.isFinite(row.minCelsius)
    && typeof row.maxCelsius === 'number' && Number.isFinite(row.maxCelsius)
    && row.minCelsius >= FAN_SENSOR_MIN_CELSIUS && row.maxCelsius <= FAN_SENSOR_MAX_CELSIUS
    && row.minCelsius < row.maxCelsius
}

/** Snap to the step inside the fan's range; the range ends themselves are returned exactly (a minimum of 1499 stays 1499). */
export function snapRpm(rpm: number, range: RpmRange, step = FAN_TARGET_STEP_RPM): number {
  if (!Number.isFinite(rpm) || rpm <= range.minRpm) return range.minRpm
  if (rpm >= range.maxRpm) return range.maxRpm
  const snapped = Math.round(rpm / step) * step
  return Math.max(range.minRpm, Math.min(range.maxRpm, snapped))
}

/** The target for a reading under a rule, in the fan's range. */
export function targetForTemperature(celsius: number, rule: Pick<FanSensorRule, 'minCelsius' | 'maxCelsius'>, range: RpmRange, step = FAN_TARGET_STEP_RPM): number {
  if (!Number.isFinite(celsius) || celsius <= rule.minCelsius) return snapRpm(range.minRpm, range, step)
  if (celsius >= rule.maxCelsius) return snapRpm(range.maxRpm, range, step)
  const fraction = (celsius - rule.minCelsius) / (rule.maxCelsius - rule.minCelsius)
  return snapRpm(range.minRpm + fraction * (range.maxRpm - range.minRpm), range, step)
}

/** Whether a computed target is worth sending, given what the helper already holds. */
export function needsTargetUpdate(appliedRpm: number | undefined, nextRpm: number, range: RpmRange, deadband = FAN_TARGET_DEADBAND_RPM): boolean {
  if (appliedRpm === undefined) return true
  // The ends of the range are always honoured exactly, so a fan reaches its true minimum/maximum.
  if ((nextRpm === range.minRpm || nextRpm === range.maxRpm) && nextRpm !== appliedRpm) return true
  return Math.abs(nextRpm - appliedRpm) >= deadband
}
