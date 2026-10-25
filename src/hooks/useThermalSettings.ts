import { useCallback, useEffect, useState } from 'react'
import type { ThermalSettings, ThermalSettingsPatch } from '../../shared/thermalApi'

export interface ThermalSettingsState {
  /** null until main answered (or when the API is missing). */
  settings: ThermalSettings | null
  /** True while an update is in flight. */
  busy: boolean
  /** Ask main to apply a patch; the mirror follows main's answer. */
  update: (patch: ThermalSettingsPatch) => Promise<{ success: boolean; error?: string }>
}

/**
 * Mirror of the thermal module settings main owns (`thermal.json`): loads once,
 * follows `thermal:settingsChanged` so a change from the tray menu shows up too.
 */
export function useThermalSettings(): ThermalSettingsState {
  const [settings, setSettings] = useState<ThermalSettings | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const api = window.api?.thermal
    if (!api?.getSettings) return
    let active = true
    const unsubscribe = api.onSettingsChanged((next) => { if (active) setSettings(next) })
    api.getSettings().then((res) => {
      if (active && res?.success && res.settings) setSettings(res.settings)
    }).catch(() => { /* leave null: the option stays hidden */ })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const update = useCallback(async (patch: ThermalSettingsPatch) => {
    const api = window.api?.thermal
    // No error text: the caller shows its localized message (thermal_tray_error).
    if (!api?.updateSettings) return { success: false }
    setBusy(true)
    try {
      const res = await api.updateSettings(patch)
      if (res?.success && res.settings) {
        setSettings(res.settings)
        return { success: true }
      }
      return { success: false, error: res?.error }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    } finally {
      setBusy(false)
    }
  }, [])

  return { settings, busy, update }
}
