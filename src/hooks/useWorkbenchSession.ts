import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { workbenchRecovery } from '../services/workbenchRecovery'
import { flushPersistedStore, useAppStore } from '../store/useAppStore'
import type { WorkbenchFeature, WorkbenchSnapshots } from '../types/workbench'
import { shouldStartFresh } from '../utils/workbenchPolicy'

export function useWorkbenchSession<K extends WorkbenchFeature>(feature: K, options: {
  snapshot: WorkbenchSnapshots[K]
  complete: boolean
  busy: boolean
  reset: () => void
  restore: (snapshot: WorkbenchSnapshots[K]) => void
}) {
  const latest = useRef(options)
  latest.current = options
  const [, refreshPrevious] = useState(0)

  useLayoutEffect(() => {
    workbenchRecovery.capture(feature, options.snapshot, options.complete && !options.busy)
  }, [feature, options.snapshot, options.complete, options.busy])

  useEffect(() => {
    let mounted = true
    let returning = false
    let departure = 0
    const leave = () => {
      departure++
      workbenchRecovery.leave(feature)
      flushPersistedStore()
      void workbenchRecovery.flush()
    }
    const enter = async () => {
      if (returning || document.visibilityState === 'hidden') return
      returning = true
      const departureAtStart = departure
      try {
        const record = workbenchRecovery.get(feature)
        const eligible = record && shouldStartFresh({
          feature, enabled: useAppStore.getState().smartSessionReset,
          busy: latest.current.busy, complete: latest.current.complete,
          awayAt: record.awayAt, completedAt: record.completedAt, now: Date.now(),
        })
        if (eligible) {
          const snapshot = latest.current.snapshot
          // Never clear content that could not be saved, or edits made during the write.
          if (!flushPersistedStore() || !await workbenchRecovery.flush()) return
          if (!mounted || departure !== departureAtStart || latest.current.snapshot !== snapshot
            || latest.current.busy || !latest.current.complete || !useAppStore.getState().smartSessionReset) return
          latest.current.reset()
          workbenchRecovery.enter(feature, snapshot)
          refreshPrevious((version) => version + 1)
        } else {
          workbenchRecovery.enter(feature)
        }
      } finally { returning = false }
    }
    const visibility = () => { if (document.visibilityState === 'hidden') leave(); else void enter() }
    const focus = () => { void enter() }
    window.addEventListener('blur', leave)
    window.addEventListener('focus', focus)
    window.addEventListener('pagehide', leave)
    document.addEventListener('visibilitychange', visibility)
    const unsubscribe = window.api?.onSessionActivity?.((activity) => {
      if (activity === 'away') leave()
      else if (document.hasFocus()) void enter()
    })
    void enter()
    return () => {
      mounted = false
      leave()
      window.removeEventListener('blur', leave)
      window.removeEventListener('focus', focus)
      window.removeEventListener('pagehide', leave)
      document.removeEventListener('visibilitychange', visibility)
      unsubscribe?.()
    }
  }, [feature])

  return {
    previous: workbenchRecovery.get(feature)?.previous ?? null,
    restorePrevious: () => {
      const previous = workbenchRecovery.get(feature)?.previous
      if (!previous || latest.current.busy) return
      latest.current.restore(previous)
      workbenchRecovery.forgetPrevious(feature)
      refreshPrevious((version) => version + 1)
    },
  }
}
