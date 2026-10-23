import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'

/**
 * Keep the store's `enabledModules` in step with the main process: one `modules:get`
 * on mount, then every `modules:changed` push (a toggle from this or another window).
 * Call once, from the app root.
 */
export function useModulesSync(): void {
  const setEnabledModules = useAppStore((state) => state.setEnabledModules)
  useEffect(() => {
    const api = window.api?.modules
    if (!api) return
    let active = true
    api.get().then((res) => {
      if (active && res?.success && res.enabled) setEnabledModules(res.enabled)
    }).catch(() => { /* keep "everything on" until main answers */ })
    const unsubscribe = api.onChanged((enabled) => { if (active) setEnabledModules(enabled) })
    return () => { active = false; unsubscribe() }
  }, [setEnabledModules])
}
