import { create } from 'zustand'
import { TOAST_ACTION_DISMISS_DELAY_MS, TOAST_DISMISS_DELAY_MS } from '../constants/ui'

export type NotificationTone = 'info' | 'success' | 'warning' | 'error'

export interface NotificationAction {
  label: string
  onClick: () => void
  disabled?: boolean
}

export interface AppNotification {
  id: string
  /** Stable owner key: a new notification with the same key replaces the old one. */
  key?: string
  tone: NotificationTone
  title?: string
  message: string
  /** Secondary line, e.g. the provider/model the failing request used. */
  detail?: string
  actions?: NotificationAction[]
  dismissible: boolean
  /** Auto-dismiss delay; `null` keeps the toast until it is dismissed. */
  durationMs: number | null
  /** Runs when the toast leaves on its own (user dismiss or timeout), not on `dismiss()`. */
  onDismiss?: () => void
}

export interface NotifyInput {
  key?: string
  tone?: NotificationTone
  title?: string
  message: string
  detail?: string
  actions?: NotificationAction[]
  dismissible?: boolean
  durationMs?: number | null
  onDismiss?: () => void
}

interface NotificationState {
  notifications: AppNotification[]
  /** Shows a toast in the app-level viewport and returns its id. */
  notify: (input: NotifyInput) => string
  /** Removes a toast by id or owner key without running its `onDismiss`. */
  dismiss: (idOrKey: string) => void
  /** Removes a toast the user closed (or that timed out) and runs its `onDismiss`. */
  expire: (id: string) => void
  /** Stops every auto-dismiss countdown while the pointer or focus is on the stack. */
  pauseTimers: () => void
  /** Restarts the countdowns with the time each one had left. */
  resumeTimers: () => void
  clear: () => void
}

let nextId = 0
/** Running countdowns: the timer and when it fires. */
const timers = new Map<string, { timer: ReturnType<typeof setTimeout>; deadline: number }>()
/** Countdowns stopped by `pauseTimers`, with the time each one had left. */
const paused = new Map<string, number>()
let timersPaused = false

function clearTimer(id: string) {
  const entry = timers.get(id)
  if (entry) {
    clearTimeout(entry.timer)
    timers.delete(id)
  }
  paused.delete(id)
}

/**
 * Transient toasts auto-dismiss, a little later when they offer an action;
 * problems (warning, error) stay until the user acts on them.
 */
function defaultDuration(tone: NotificationTone, hasActions: boolean): number | null {
  if (tone !== 'success' && tone !== 'info') return null
  return hasActions ? TOAST_ACTION_DISMISS_DELAY_MS : TOAST_DISMISS_DELAY_MS
}

/**
 * App-wide notification stack rendered by the `NotificationViewport` organism
 * at the bottom-right of the window, above modals and overlays.
 */
export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],

  notify: (input) => {
    nextId += 1
    const id = `notification-${nextId}`
    const tone = input.tone ?? 'info'
    const durationMs = input.durationMs === undefined ? defaultDuration(tone, (input.actions?.length ?? 0) > 0) : input.durationMs
    const notification: AppNotification = {
      id,
      key: input.key,
      tone,
      title: input.title,
      message: input.message,
      detail: input.detail,
      actions: input.actions,
      dismissible: input.dismissible ?? true,
      durationMs,
      onDismiss: input.onDismiss,
    }
    set((state) => {
      const kept = input.key
        ? state.notifications.filter((item) => {
            if (item.key !== input.key) return true
            clearTimer(item.id)
            return false
          })
        : state.notifications
      return { notifications: [...kept, notification] }
    })
    if (durationMs !== null) {
      if (timersPaused) paused.set(id, durationMs)
      else timers.set(id, { timer: setTimeout(() => get().expire(id), durationMs), deadline: Date.now() + durationMs })
    }
    return id
  },

  dismiss: (idOrKey) => {
    set((state) => {
      const next = state.notifications.filter((item) => {
        if (item.id !== idOrKey && item.key !== idOrKey) return true
        clearTimer(item.id)
        return false
      })
      return next.length === state.notifications.length ? state : { notifications: next }
    })
  },

  expire: (id) => {
    const target = get().notifications.find((item) => item.id === id)
    if (!target) return
    clearTimer(id)
    set((state) => ({ notifications: state.notifications.filter((item) => item.id !== id) }))
    target.onDismiss?.()
  },

  pauseTimers: () => {
    if (timersPaused) return
    timersPaused = true
    const now = Date.now()
    for (const [id, entry] of timers) {
      clearTimeout(entry.timer)
      paused.set(id, Math.max(0, entry.deadline - now))
    }
    timers.clear()
  },

  resumeTimers: () => {
    if (!timersPaused) return
    timersPaused = false
    const now = Date.now()
    for (const [id, remaining] of paused) {
      timers.set(id, { timer: setTimeout(() => get().expire(id), remaining), deadline: now + remaining })
    }
    paused.clear()
  },

  clear: () => {
    for (const id of [...timers.keys(), ...paused.keys()]) clearTimer(id)
    timersPaused = false
    set({ notifications: [] })
  },
}))
