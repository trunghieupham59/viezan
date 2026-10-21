import { create } from 'zustand'
import type { UpdateStatus } from '../../shared/updater'

export const UPDATE_SNOOZE_MS = 24 * 60 * 60 * 1_000
const SNOOZE_KEY = 'viezan:update-snoozes'

function readSnoozes(): Record<string, number> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter(([, until]) =>
      typeof until === 'number' && Number.isFinite(until) && until > Date.now(),
    ))
  } catch { return {} }
}

interface UpdaterState {
  status: UpdateStatus
  snoozes: Record<string, number>
  receive: (status: UpdateStatus) => void
  snooze: (version: string) => void
}

/** Shared by the global notification and Settings; only snoozes are persisted. */
export const useUpdaterStore = create<UpdaterState>((set) => ({
  status: { type: 'idle' },
  snoozes: readSnoozes(),
  receive: (status) => set((state) => {
    // Background checks never surface errors or replace an actionable update
    // with a transient checking indicator.
    if (status.background && (status.type === 'error' || status.type === 'error-codesign' || status.type === 'checking')) return state
    if ((status.type === 'error' || status.type === 'error-codesign') &&
      (state.status.type === 'available' || state.status.type === 'downloading' || state.status.type === 'downloaded')) {
      return { status: { ...state.status, type: state.status.type === 'downloaded' ? 'downloaded' : 'available',
        error: status.error ?? 'Code signature verification failed' } }
    }
    return { status: status.type === 'downloading' || status.type === 'downloaded'
      ? { ...status, version: status.version ?? state.status.version }
      : status }
  }),
  snooze: (version) => set((state) => {
    const snoozes = { ...readSnoozes(), ...state.snoozes, [version]: Date.now() + UPDATE_SNOOZE_MS }
    try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(snoozes)) } catch { /* Session fallback when storage is unavailable. */ }
    return { snoozes }
  }),
}))
