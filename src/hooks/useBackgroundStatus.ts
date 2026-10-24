import { useCallback, useEffect, useState } from 'react'
import type { ModuleEnabledState } from '../../shared/modules'
import type { FanProfile } from '../../shared/thermalApi'
import { useFanControl } from './useFanControl'
import { useFanProfiles } from './useFanProfiles'

/**
 * What Viezan is doing while its window is not in front, for the strip at the
 * bottom of the primary navigation. Every field is null/0/false when that part is
 * off, disabled as a module or unavailable on this machine, so the strip shows
 * only what is actually running.
 */
export interface BackgroundStatus {
  /** The fan helper is connected; `profile` is the profile it runs, null for a custom setup. */
  fans: { profile: FanProfile | null } | null
  /** Enabled global shortcuts (Quick Translate, Launcher). */
  globalShortcuts: number
  /** The browser bridge is on and at least one extension token exists. */
  browserBridge: boolean
}

function shortcutOn(settings: Record<string, unknown> | undefined): boolean {
  return settings?.enabled === true
}

/**
 * Collects the background status from the APIs the feature pages already use.
 * Read-only calls with no side effects, re-read when the window regains focus
 * rather than polled.
 *
 * Local AI is deliberately absent: `discoverLocalAi` may start the app-managed
 * Ollama runtime, so it must not run just to paint a status row. It joins once
 * main exposes a read-only, cache-only status call.
 */
export function useBackgroundStatus(enabledModules: ModuleEnabledState): BackgroundStatus {
  const fanControl = useFanControl()
  const fanProfiles = useFanProfiles()
  const [globalShortcuts, setGlobalShortcuts] = useState(0)
  const [browserBridge, setBrowserBridge] = useState(false)

  const launcherOn = enabledModules.launcher !== false
  const bridgeOn = enabledModules['browser-bridge'] !== false

  const refresh = useCallback(async () => {
    const api = window.api
    if (!api) return
    try {
      const [quick, launcher] = await Promise.all([api.hotkey?.get?.(), launcherOn ? api.hotkey?.chat?.get?.() : undefined])
      setGlobalShortcuts(Number(shortcutOn(quick?.settings)) + Number(launcherOn && shortcutOn(launcher?.settings)))
    } catch {
      setGlobalShortcuts(0)
    }
    try {
      const tokens = bridgeOn ? await api.localServer?.listTokens?.() : undefined
      setBrowserBridge(Boolean(bridgeOn && tokens?.success && tokens.tokens.length > 0))
    } catch {
      setBrowserBridge(false)
    }
  }, [launcherOn, bridgeOn])

  useEffect(() => {
    void refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [refresh])

  const thermalOn = enabledModules.thermal !== false
  const profiles = fanProfiles.state
  const activeProfile = profiles?.applied && profiles.activeId ? profiles.profiles.find((profile) => profile.id === profiles.activeId) ?? null : null
  const fans = thermalOn && fanControl.state?.helper === 'ready' ? { profile: activeProfile } : null

  return { fans, globalShortcuts, browserBridge }
}
