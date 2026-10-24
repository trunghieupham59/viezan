import { useCallback, useEffect, useState } from 'react'
import type { FanCalibrationState } from '../../shared/thermalApi'

export interface FanCalibrationHookState {
  /** null until main answered (or when the API is missing). */
  state: FanCalibrationState | null
  busy: boolean
  start: () => Promise<{ success: boolean; error?: string }>
  cancel: () => Promise<{ success: boolean; error?: string }>
  clear: () => Promise<{ success: boolean; error?: string }>
}

type Result = { success: boolean; state?: FanCalibrationState; error?: string } | undefined

const unavailable = async (): Promise<Result> => ({ success: false, error: 'Fan calibration is not available in this window.' })

/** Mirror of main's fan ↔ sensor calibration: progress while it runs, the last result otherwise. */
export function useFanCalibration(): FanCalibrationHookState {
  const [state, setState] = useState<FanCalibrationState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const api = window.api?.thermal?.fanControl?.calibration
    if (!api) return
    let active = true
    const unsubscribe = api.onState((next) => { if (active) setState(next) })
    api.get().then((res) => {
      if (active && res?.success && res.state) setState(res.state)
    }).catch(() => { /* leave null */ })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const run = useCallback(async (work: () => Promise<Result>) => {
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
    start: useCallback(() => run(() => window.api?.thermal?.fanControl?.calibration?.start() ?? unavailable()), [run]),
    cancel: useCallback(() => run(() => window.api?.thermal?.fanControl?.calibration?.cancel() ?? unavailable()), [run]),
    clear: useCallback(() => run(() => window.api?.thermal?.fanControl?.calibration?.clear() ?? unavailable()), [run]),
  }
}
