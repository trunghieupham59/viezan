/**
 * Shape checks for fan profiles as they are persisted (`thermal.json`) and received
 * over IPC. Kept apart from the service so the settings store can import them without
 * pulling in the helper-facing code.
 */
import type { FanProfile, FanProfileEntry, ThermalSensorGroup } from '../../shared/thermalApi'
import { isRecord } from '../ipc/ipcValidation'
import { isFanCommand } from './fanControlTypes'
import { isFanSensorRule } from './fanCurve'

export const MAX_USER_FAN_PROFILES = 24
export const MAX_FAN_PROFILE_NAME_LENGTH = 40
export const FAN_PROFILE_WILDCARD = '*'

const SENSOR_GROUPS: readonly ThermalSensorGroup[] = ['cpu', 'gpu', 'other']

export function isUserFanProfileId(value: unknown): value is string {
  return typeof value === 'string' && /^user:[A-Za-z0-9-]{1,64}$/.test(value)
}

export function isFanProfileEntry(value: unknown): value is FanProfileEntry {
  if (isFanCommand(value)) return true
  if (!isRecord(value) || value.mode !== 'sensor-group') return false
  return typeof value.group === 'string' && (SENSOR_GROUPS as readonly string[]).includes(value.group)
    && isFanSensorRule({ sensorId: 'group', minCelsius: value.minCelsius, maxCelsius: value.maxCelsius })
}

export function isValidFanProfileName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= MAX_FAN_PROFILE_NAME_LENGTH
}

/** A persisted user profile: user id, bounded name, and a small map of validated entries. */
export function isUserFanProfile(value: unknown): value is FanProfile {
  if (!isRecord(value) || !isUserFanProfileId(value.id) || value.builtin !== false || !isValidFanProfileName(value.name)) return false
  const fans = value.fans
  if (!isRecord(fans)) return false
  const keys = Object.keys(fans)
  if (keys.length > 32) return false
  return keys.every((key) => (key === FAN_PROFILE_WILDCARD || (key.length > 0 && key.length <= 64)) && isFanProfileEntry(fans[key]))
}
