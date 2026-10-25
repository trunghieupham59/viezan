import { useCallback, useEffect, useRef, useState } from 'react'
import type { ThermalSnapshot, ThermalSupport } from '../../shared/thermalApi'
import { useT } from '../store/useAppStore'

/** Samples kept per sensor: at one every two seconds, 90 is three minutes. */
export const THERMAL_HISTORY_SAMPLES = 90
export const THERMAL_SAMPLE_INTERVAL_MS = 2000

export type ThermalHistory = Readonly<Record<string, readonly number[]>>

export interface ThermalMonitorState {
  /** null until main answered the support query. */
  support: ThermalSupport | null
  snapshot: ThermalSnapshot | null
  history: ThermalHistory
  error: string | null
  retry: () => void
}

function appendHistory(history: ThermalHistory, snapshot: ThermalSnapshot): ThermalHistory {
  const next: Record<string, readonly number[]> = {}
  for (const sensor of snapshot.sensors) {
    const previous = history[sensor.id] ?? []
    next[sensor.id] = previous.length >= THERMAL_HISTORY_SAMPLES
      ? [...previous.slice(previous.length - THERMAL_HISTORY_SAMPLES + 1), sensor.celsius]
      : [...previous, sensor.celsius]
  }
  for (const fan of snapshot.fans) {
    const previous = history[fan.id] ?? []
    next[fan.id] = previous.length >= THERMAL_HISTORY_SAMPLES
      ? [...previous.slice(previous.length - THERMAL_HISTORY_SAMPLES + 1), fan.rpm]
      : [...previous, fan.rpm]
  }
  return next
}

/**
 * Drive the main process's thermal monitor for as long as the caller is mounted and
 * the document is visible: main pushes a snapshot every two seconds; this keeps the
 * latest one plus a short history per sensor and fan for sparklines.
 */
export function useThermalMonitor(): ThermalMonitorState {
  const [support, setSupport] = useState<ThermalSupport | null>(null)
  const [snapshot, setSnapshot] = useState<ThermalSnapshot | null>(null)
  const [history, setHistory] = useState<ThermalHistory>({})
  const [error, setError] = useState<string | null>(null)
  const supportedRef = useRef(false)
  const t = useT()
  // Read through a ref so a language change does not restart monitoring.
  const fallbackErrorRef = useRef(t.thermal_error_desc)
  fallbackErrorRef.current = t.thermal_error_desc

  const applySnapshot = useCallback((next: ThermalSnapshot) => {
    setSnapshot(next)
    setHistory((previous) => appendHistory(previous, next))
    setError(null)
  }, [])

  useEffect(() => {
    const api = window.api?.thermal
    if (!api) {
      setSupport({ supported: false, reason: 'unsupported-platform' })
      return
    }
    let active = true
    let monitoring = false

    const setMonitoring = (on: boolean) => {
      if (!supportedRef.current || monitoring === on) return
      monitoring = on
      void api.setMonitoring(on).then((res) => {
        if (active && on && res && !res.success) setError(res.error || fallbackErrorRef.current)
      })
    }
    const onVisibility = () => setMonitoring(document.visibilityState !== 'hidden')

    const unsubSnapshot = api.onSnapshot((next) => { if (active) applySnapshot(next) })
    const unsubError = api.onError((e) => { if (active) setError(e?.message || fallbackErrorRef.current) })

    api.getSupport().then((res) => {
      if (!active) return
      const next: ThermalSupport = res?.success && res.support ? res.support : { supported: false, reason: 'unsupported-platform' }
      supportedRef.current = next.supported
      setSupport(next)
      if (next.supported) onVisibility()
    }).catch(() => {
      if (active) setSupport({ supported: false, reason: 'unsupported-platform' })
    })
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVisibility)
      unsubSnapshot()
      unsubError()
      if (monitoring) void api.setMonitoring(false)
    }
  }, [applySnapshot])

  const retry = useCallback(() => {
    const api = window.api?.thermal
    if (!api) return
    setError(null)
    void api.read().then((res) => {
      if (res?.success && res.snapshot) applySnapshot(res.snapshot)
      else setError(res?.error || fallbackErrorRef.current)
    }).catch(() => setError(fallbackErrorRef.current))
  }, [applySnapshot])

  return { support, snapshot, history, error, retry }
}
