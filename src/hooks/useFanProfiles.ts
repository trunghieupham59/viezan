import { useCallback, useEffect, useState } from 'react'
import type { FanProfilesState } from '../../shared/thermalApi'

export interface FanProfilesHookState {
  /** null until main answered (or when the API is missing). */
  state: FanProfilesState | null
  busy: boolean
  apply: (id: string) => Promise<{ success: boolean; error?: string }>
  saveCurrent: (name: string) => Promise<{ success: boolean; error?: string }>
  remove: (id: string) => Promise<{ success: boolean; error?: string }>
}

type ProfilesResult = { success: boolean; state?: FanProfilesState; error?: string } | undefined

const unavailable = async (): Promise<ProfilesResult> => ({ success: false, error: 'Fan profiles are not available in this window.' })

/** Mirror of main's fan profiles (built-in + saved, which one is active and applied). */
export function useFanProfiles(): FanProfilesHookState {
  const [state, setState] = useState<FanProfilesState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const api = window.api?.thermal?.fanControl?.profiles
    if (!api) return
    let active = true
    const unsubscribe = api.onState((next) => { if (active) setState(next) })
    api.get().then((res) => {
      if (active && res?.success && res.state) setState(res.state)
    }).catch(() => { /* leave null: the section stays hidden */ })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const run = useCallback(async (work: () => Promise<ProfilesResult>) => {
    setBusy(true)
    try {
      const res = await work()
      if (res?.success && res.state) {
        setState(res.state)
        return { success: true }
      }
      return { success: false, error: res?.error }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    } finally {
      setBusy(false)
    }
  }, [])

  return {
    state,
    busy,
    apply: useCallback((id: string) => run(() => window.api?.thermal?.fanControl?.profiles?.apply(id) ?? unavailable()), [run]),
    saveCurrent: useCallback((name: string) => run(() => window.api?.thermal?.fanControl?.profiles?.saveCurrent(name) ?? unavailable()), [run]),
    remove: useCallback((id: string) => run(() => window.api?.thermal?.fanControl?.profiles?.remove(id) ?? unavailable()), [run]),
  }
}
