import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOAST_ACTION_DISMISS_DELAY_MS, TOAST_DISMISS_DELAY_MS } from '../../constants/ui'
import { useNotificationStore } from '../useNotificationStore'

describe('useNotificationStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useNotificationStore.getState().clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('auto-dismisses transient tones and keeps problems until acted on', () => {
    const { notify } = useNotificationStore.getState()
    notify({ tone: 'success', message: 'Saved' })
    notify({ tone: 'error', message: 'Failed' })
    expect(useNotificationStore.getState().notifications.map((n) => n.message)).toEqual(['Saved', 'Failed'])

    vi.advanceTimersByTime(TOAST_DISMISS_DELAY_MS)
    expect(useNotificationStore.getState().notifications.map((n) => n.message)).toEqual(['Failed'])
  })

  it('replaces a notification that shares the same owner key', () => {
    const { notify } = useNotificationStore.getState()
    notify({ key: 'lookup', tone: 'error', message: 'First' })
    notify({ key: 'lookup', tone: 'error', message: 'Second' })
    notify({ key: 'other', tone: 'error', message: 'Other' })

    expect(useNotificationStore.getState().notifications.map((n) => n.message)).toEqual(['Second', 'Other'])
  })

  it('runs onDismiss only when the toast leaves on its own', () => {
    const onDismiss = vi.fn()
    const { notify, dismiss, expire } = useNotificationStore.getState()

    const programmatic = notify({ key: 'a', tone: 'error', message: 'A', onDismiss })
    dismiss(programmatic)
    expect(onDismiss).not.toHaveBeenCalled()

    const byUser = notify({ key: 'b', tone: 'error', message: 'B', onDismiss })
    expire(byUser)
    expect(onDismiss).toHaveBeenCalledTimes(1)

    notify({ key: 'c', tone: 'info', message: 'C', onDismiss, durationMs: 100 })
    vi.advanceTimersByTime(100)
    expect(onDismiss).toHaveBeenCalledTimes(2)
    expect(useNotificationStore.getState().notifications).toEqual([])
  })

  it('dismisses by owner key without running onDismiss', () => {
    const onDismiss = vi.fn()
    const { notify, dismiss } = useNotificationStore.getState()
    notify({ key: 'voice', tone: 'warning', message: 'Mic', onDismiss })
    dismiss('voice')
    expect(useNotificationStore.getState().notifications).toEqual([])
    expect(onDismiss).not.toHaveBeenCalled()
  })
  it('keeps a transient toast with an action on screen longer', () => {
    const { notify } = useNotificationStore.getState()
    notify({ tone: 'success', message: 'Deleted', actions: [{ label: 'Undo', onClick: () => {} }] })
    vi.advanceTimersByTime(TOAST_DISMISS_DELAY_MS)
    expect(useNotificationStore.getState().notifications.map((n) => n.message)).toEqual(['Deleted'])
    vi.advanceTimersByTime(TOAST_ACTION_DISMISS_DELAY_MS - TOAST_DISMISS_DELAY_MS)
    expect(useNotificationStore.getState().notifications).toEqual([])
  })

  it('pauses every countdown while the stack is hovered and resumes with the time left', () => {
    const { notify, pauseTimers, resumeTimers } = useNotificationStore.getState()
    notify({ tone: 'info', message: 'Copied' })
    vi.advanceTimersByTime(TOAST_DISMISS_DELAY_MS - 1000)
    pauseTimers()
    notify({ tone: 'success', message: 'Saved while paused' })
    vi.advanceTimersByTime(TOAST_DISMISS_DELAY_MS * 5)
    expect(useNotificationStore.getState().notifications.map((n) => n.message)).toEqual(['Copied', 'Saved while paused'])

    resumeTimers()
    vi.advanceTimersByTime(1000)
    expect(useNotificationStore.getState().notifications.map((n) => n.message)).toEqual(['Saved while paused'])
    vi.advanceTimersByTime(TOAST_DISMISS_DELAY_MS - 1000)
    expect(useNotificationStore.getState().notifications).toEqual([])
  })
})
