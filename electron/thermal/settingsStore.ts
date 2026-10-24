/**
 * Thermal module settings — a small JSON file under userData owned by the main
 * process, so the menu bar / tray reading can be restored at launch before any
 * window exists. Validation is strict: unknown keys are ignored and a wrong type
 * rejects the whole patch, like the hotkey settings store.
 */
import * as fs from 'node:fs'
import type { ThermalSettings, ThermalSettingsPatch, ThermalTrayMetric, ThermalTraySettings } from '../../shared/thermalApi'
import { isRecord } from '../ipc/ipcValidation'

export const THERMAL_SETTINGS_FILE = 'thermal.json'

export const THERMAL_TRAY_METRICS: readonly ThermalTrayMetric[] = ['hottest', 'cpu', 'gpu']

export const DEFAULT_THERMAL_SETTINGS: ThermalSettings = {
  tray: { enabled: false, metric: 'hottest', showFan: false },
}

function isTrayMetric(value: unknown): value is ThermalTrayMetric {
  return typeof value === 'string' && (THERMAL_TRAY_METRICS as readonly string[]).includes(value)
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
    patch.tray = tray
  }
  return { ok: true, patch }
}

export function applyThermalSettingsPatch(current: ThermalSettings, patch: ThermalSettingsPatch): ThermalSettings {
  return { tray: { ...current.tray, ...(patch.tray ?? {}) } }
}

/** Read the file leniently: anything malformed falls back to the defaults field by field. */
export function loadThermalSettings(filePath: string, log: Pick<Console, 'warn'> = console): ThermalSettings {
  if (!fs.existsSync(filePath)) return { tray: { ...DEFAULT_THERMAL_SETTINGS.tray } }
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    const parsed = parseThermalSettingsPatch(raw)
    if (!parsed.ok) return { tray: { ...DEFAULT_THERMAL_SETTINGS.tray } }
    return applyThermalSettingsPatch(DEFAULT_THERMAL_SETTINGS, parsed.patch)
  } catch (e) {
    log.warn('[Thermal] Could not read the settings file; using defaults.', e)
    return { tray: { ...DEFAULT_THERMAL_SETTINGS.tray } }
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
    get: () => ({ tray: { ...current.tray } }),
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
        for (const listener of listeners) listener({ tray: { ...next.tray } })
      }
      return { tray: { ...next.tray } }
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}
