/**
 * Thermal module settings — a small JSON file under userData owned by the main
 * process, so the menu bar / tray reading can be restored at launch before any
 * window exists. Validation is strict: unknown keys are ignored and a wrong type
 * rejects the whole patch, like the hotkey settings store.
 */
import * as fs from 'node:fs'
import type { FanAffinityResult, ThermalFanControlSettings, ThermalFanProfilesSettings, ThermalSettings, ThermalSettingsPatch, ThermalTrayFanFormat, ThermalTrayLayout, ThermalTrayMetric, ThermalTraySettings } from '../../shared/thermalApi'
import { isRecord } from '../ipc/ipcValidation'
import { isUserFanProfile, isUserFanProfileId, MAX_USER_FAN_PROFILES } from './fanProfilesSchema'

export const THERMAL_SETTINGS_FILE = 'thermal.json'

export const THERMAL_TRAY_METRICS: readonly ThermalTrayMetric[] = ['hottest', 'cpu', 'gpu']
export const THERMAL_TRAY_LAYOUTS: readonly ThermalTrayLayout[] = ['inline', 'stacked']
export const THERMAL_TRAY_FAN_FORMATS: readonly ThermalTrayFanFormat[] = ['rpm', 'short']

export const DEFAULT_THERMAL_SETTINGS: ThermalSettings = {
  tray: { enabled: false, metric: 'hottest', showFan: false, layout: 'inline', showUnit: true, fanFormat: 'rpm' },
  fanControl: { acknowledged: false },
  fanProfiles: { activeId: null, user: [] },
  fanAffinity: null,
}

function isFanAffinityResult(value: unknown): value is FanAffinityResult {
  if (!isRecord(value) || typeof value.calibratedAt !== 'number' || !Array.isArray(value.fans) || value.fans.length > 16) return false
  if (value.model !== undefined && typeof value.model !== 'string') return false
  return value.fans.every((fan: unknown) => isRecord(fan) && typeof fan.fanId === 'string' && fan.fanId.length <= 64 && Array.isArray(fan.sensors) && fan.sensors.length <= 256
    && fan.sensors.every((sensor: unknown) => isRecord(sensor) && typeof sensor.sensorId === 'string' && sensor.sensorId.length <= 64
      && typeof sensor.cooling === 'number' && Number.isFinite(sensor.cooling) && typeof sensor.share === 'number' && Number.isFinite(sensor.share)
      && (sensor.contrast === undefined || (typeof sensor.contrast === 'number' && Number.isFinite(sensor.contrast)))))
}

function cloneSettings(settings: ThermalSettings): ThermalSettings {
  return {
    tray: { ...settings.tray },
    fanControl: { ...settings.fanControl },
    fanProfiles: { activeId: settings.fanProfiles.activeId, user: settings.fanProfiles.user.map((profile) => ({ ...profile, fans: { ...profile.fans } })) },
    fanAffinity: settings.fanAffinity ? { ...settings.fanAffinity, fans: settings.fanAffinity.fans.map((fan) => ({ ...fan, sensors: fan.sensors.map((sensor) => ({ ...sensor })) })) } : null,
  }
}

function isTrayMetric(value: unknown): value is ThermalTrayMetric {
  return typeof value === 'string' && (THERMAL_TRAY_METRICS as readonly string[]).includes(value)
}

function isTrayLayout(value: unknown): value is ThermalTrayLayout {
  return typeof value === 'string' && (THERMAL_TRAY_LAYOUTS as readonly string[]).includes(value)
}

function isTrayFanFormat(value: unknown): value is ThermalTrayFanFormat {
  return typeof value === 'string' && (THERMAL_TRAY_FAN_FORMATS as readonly string[]).includes(value)
}

type ParsedPatch = { ok: true; patch: ThermalSettingsPatch } | { ok: false; error: string }

/** Whitelist and type-check a patch from the renderer. `undefined` fields mean "leave unchanged". */
export function parseThermalSettingsPatch(raw: unknown): ParsedPatch {
  if (!isRecord(raw)) return { ok: false, error: 'Invalid thermal settings payload.' }
  const patch: ThermalSettingsPatch = {}
  if (raw.tray !== undefined) {
    if (!isRecord(raw.tray)) return { ok: false, error: 'Invalid "tray" value.' }
    const tray: Partial<ThermalTraySettings> = {}
    if (raw.tray.enabled !== undefined) {
      if (typeof raw.tray.enabled !== 'boolean') return { ok: false, error: 'Invalid "tray.enabled" value.' }
      tray.enabled = raw.tray.enabled
    }
    if (raw.tray.metric !== undefined) {
      if (!isTrayMetric(raw.tray.metric)) return { ok: false, error: 'Invalid "tray.metric" value.' }
      tray.metric = raw.tray.metric
    }
    if (raw.tray.showFan !== undefined) {
      if (typeof raw.tray.showFan !== 'boolean') return { ok: false, error: 'Invalid "tray.showFan" value.' }
      tray.showFan = raw.tray.showFan
    }
    if (raw.tray.layout !== undefined) {
      if (!isTrayLayout(raw.tray.layout)) return { ok: false, error: 'Invalid "tray.layout" value.' }
      tray.layout = raw.tray.layout
    }
    if (raw.tray.showUnit !== undefined) {
      if (typeof raw.tray.showUnit !== 'boolean') return { ok: false, error: 'Invalid "tray.showUnit" value.' }
      tray.showUnit = raw.tray.showUnit
    }
    if (raw.tray.fanFormat !== undefined) {
      if (!isTrayFanFormat(raw.tray.fanFormat)) return { ok: false, error: 'Invalid "tray.fanFormat" value.' }
      tray.fanFormat = raw.tray.fanFormat
    }
    patch.tray = tray
  }
  if (raw.fanControl !== undefined) {
    if (!isRecord(raw.fanControl)) return { ok: false, error: 'Invalid "fanControl" value.' }
    const fanControl: Partial<ThermalFanControlSettings> = {}
    if (raw.fanControl.acknowledged !== undefined) {
      if (typeof raw.fanControl.acknowledged !== 'boolean') return { ok: false, error: 'Invalid "fanControl.acknowledged" value.' }
      fanControl.acknowledged = raw.fanControl.acknowledged
    }
    patch.fanControl = fanControl
  }
  if (raw.fanProfiles !== undefined) {
    if (!isRecord(raw.fanProfiles)) return { ok: false, error: 'Invalid "fanProfiles" value.' }
    const fanProfiles: Partial<ThermalFanProfilesSettings> = {}
    if (raw.fanProfiles.activeId !== undefined) {
      const id = raw.fanProfiles.activeId
      if (id !== null && !(typeof id === 'string' && (id.startsWith('builtin:') || isUserFanProfileId(id)) && id.length <= 80)) {
        return { ok: false, error: 'Invalid "fanProfiles.activeId" value.' }
      }
      fanProfiles.activeId = id
    }
    if (raw.fanProfiles.user !== undefined) {
      const user = raw.fanProfiles.user
      if (!Array.isArray(user) || user.length > MAX_USER_FAN_PROFILES || !user.every(isUserFanProfile)) {
        return { ok: false, error: 'Invalid "fanProfiles.user" value.' }
      }
      fanProfiles.user = user.map((profile) => ({ ...profile, fans: { ...profile.fans } }))
    }
    patch.fanProfiles = fanProfiles
  }
  if (raw.fanAffinity !== undefined) {
    if (raw.fanAffinity !== null && !isFanAffinityResult(raw.fanAffinity)) return { ok: false, error: 'Invalid "fanAffinity" value.' }
    patch.fanAffinity = raw.fanAffinity
  }
  return { ok: true, patch }
}

export function applyThermalSettingsPatch(current: ThermalSettings, patch: ThermalSettingsPatch): ThermalSettings {
  return {
    tray: { ...current.tray, ...(patch.tray ?? {}) },
    fanControl: { ...current.fanControl, ...(patch.fanControl ?? {}) },
    fanProfiles: { ...current.fanProfiles, ...(patch.fanProfiles ?? {}) },
    fanAffinity: patch.fanAffinity !== undefined ? patch.fanAffinity : current.fanAffinity,
  }
}

/** Read the file leniently: anything malformed falls back to the defaults field by field. */
export function loadThermalSettings(filePath: string, log: Pick<Console, 'warn'> = console): ThermalSettings {
  if (!fs.existsSync(filePath)) return cloneSettings(DEFAULT_THERMAL_SETTINGS)
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    const parsed = parseThermalSettingsPatch(raw)
    if (!parsed.ok) return cloneSettings(DEFAULT_THERMAL_SETTINGS)
    return applyThermalSettingsPatch(DEFAULT_THERMAL_SETTINGS, parsed.patch)
  } catch (e) {
    log.warn('[Thermal] Could not read the settings file; using defaults.', e)
    return cloneSettings(DEFAULT_THERMAL_SETTINGS)
  }
}

export function saveThermalSettings(filePath: string, settings: ThermalSettings): void {
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8')
}

export interface ThermalSettingsStore {
  get: () => ThermalSettings
  /** Apply a validated patch, persist, and notify listeners when something changed. */
  update: (patch: ThermalSettingsPatch) => ThermalSettings
  subscribe: (listener: (settings: ThermalSettings) => void) => () => void
}

export function createThermalSettingsStore(options: {
  load: () => ThermalSettings
  save: (settings: ThermalSettings) => void
  log?: Pick<Console, 'error'>
}): ThermalSettingsStore {
  const { load, save, log = console } = options
  let current = load()
  const listeners = new Set<(settings: ThermalSettings) => void>()
  return {
    get: () => cloneSettings(current),
    update: (patch) => {
      const next = applyThermalSettingsPatch(current, patch)
      const changed = JSON.stringify(next) !== JSON.stringify(current)
      current = next
      if (changed) {
        try {
          save(next)
        } catch (e) {
          log.error('[Thermal] Could not save the settings file:', e)
        }
        for (const listener of listeners) listener(cloneSettings(next))
      }
      return cloneSettings(next)
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}
