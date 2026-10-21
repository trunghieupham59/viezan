import { create } from 'zustand'
import { TOAST_DISMISS_DELAY_MS } from '../constants/ui'

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
  clear: () => void
}

let nextId = 0
const timers = new Map<string, ReturnType<typeof setTimeout>>()

function clearTimer(id: string) {
  const timer = timers.get(id)
  if (timer) {
    clearTimeout(timer)
    timers.delete(id)
  }
}

/** Transient toasts auto-dismiss; problems stay until the user acts on them. */
function defaultDuration(tone: NotificationTone): number | null {
  return tone === 'success' || tone === 'info' ? TOAST_DISMISS_DELAY_MS : null
}

/**
 * App-wide notification stack rendered by the `NotificationViewport` organism
 * at the top-right of the window, above modals and overlays.
 */
export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],

  notify: (input) => {
    nextId += 1
    const id = `notification-${nextId}`
    const tone = input.tone ?? 'info'
    const durationMs = input.durationMs === undefined ? defaultDuration(tone) : input.durationMs
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
      timers.set(id, setTimeout(() => get().expire(id), durationMs))
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

  clear: () => {
    for (const id of timers.keys()) clearTimer(id)
    set({ notifications: [] })
  },
}))
