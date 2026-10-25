import { useCallback, useEffect, useState } from 'react'
import type { FanCommand, FanControlState } from '../../shared/thermalApi'

const NO_FAN_CONTROL: FanControlState = { helper: 'unsupported', fans: [] }

type FanResult = { success: boolean; state?: FanControlState; error?: string } | undefined

/** No error text: callers fall back to their localized message (thermal_fan_error). */
const unavailable = async (): Promise<FanResult> => ({ success: false })

export interface FanControlHookState {
  /** null until main answered. */
  state: FanControlState | null
  /** True while a command is in flight. */
  busy: boolean
  enable: () => Promise<{ success: boolean; error?: string }>
  disable: () => Promise<{ success: boolean; error?: string }>
  restoreAll: () => Promise<{ success: boolean; error?: string }>
  setFan: (fanId: string, command: FanCommand) => Promise<{ success: boolean; error?: string }>
}

/**
 * Mirror of main's fan control state (helper status and per-fan mode). Loads once,
 * follows `thermal:fan:state`, and wraps each command so the UI gets a simple
 * success/error answer while the mirror follows main's reply.
 */
export function useFanControl(): FanControlHookState {
  const [state, setState] = useState<FanControlState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const api = window.api?.thermal?.fanControl
    if (!api) {
      setState(NO_FAN_CONTROL)
      return
    }
    let active = true
    const unsubscribe = api.onState((next) => { if (active) setState(next) })
    api.getState().then((res) => {
      if (active) setState(res?.success && res.state ? res.state : NO_FAN_CONTROL)
    }).catch(() => { if (active) setState(NO_FAN_CONTROL) })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const run = useCallback(async (work: () => Promise<FanResult>) => {
    setBusy(true)
    try {
      const res = await work()
      if (res?.success && res.state) {
        setState(res.state)
        return { success: true }
      }
      if (res?.state) setState(res.state)
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
    enable: useCallback(() => run(() => window.api?.thermal?.fanControl?.enable() ?? unavailable()), [run]),
    disable: useCallback(() => run(() => window.api?.thermal?.fanControl?.disable() ?? unavailable()), [run]),
    restoreAll: useCallback(() => run(() => window.api?.thermal?.fanControl?.restoreAll() ?? unavailable()), [run]),
    setFan: useCallback((fanId: string, command: FanCommand) => run(() => window.api?.thermal?.fanControl?.setFan(fanId, command) ?? unavailable()), [run]),
  }
}
