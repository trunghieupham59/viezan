import { type CSSProperties, useLayoutEffect, useRef, useState } from 'react'
import { TOAST_MAX_VISIBLE } from '../../constants/ui'
import { useT } from '../../store/useAppStore'
import { useNotificationStore } from '../../store/useNotificationStore'
import { NotificationToast } from '../ui/molecules'

/** The surface toasts must never cover: the AI Chat composer. */
const PROTECTED_SURFACE = '.chat-composer'

/**
 * How far above the window's bottom edge the stack must sit so it stays clear of
 * the chat composer, or null when the bottom corner is already clear: no composer,
 * the composer is outside the stack's column, or there is room under it (a chat
 * that is still empty centres its composer). The composer moves, so this is
 * measured rather than set as a fixed offset.
 */
function measureLift(stack: HTMLElement): number | null {
  const composer = document.querySelector(PROTECTED_SURFACE)
  if (!composer) return null
  const composerRect = composer.getBoundingClientRect()
  const stackRect = stack.getBoundingClientRect()
  const sharesColumn = composerRect.right > stackRect.left && composerRect.left < stackRect.right
  if (!sharesColumn) return null
  const edge = Number.parseFloat(getComputedStyle(stack).getPropertyValue('--vzn-space-4')) || 0
  const bottomPlacedTop = window.innerHeight - edge - stackRect.height
  if (bottomPlacedTop >= composerRect.bottom) return null
  return Math.max(0, window.innerHeight - composerRect.top)
}

/**
 * App-level toast stack at the bottom-right of the window, newest at the bottom.
 * Every feature and Settings section reports errors and confirmations here through
 * `useNotificationStore`, so no screen owns an inline banner of its own.
 *
 * - At most `TOAST_MAX_VISIBLE` (the newest) show at once; older open ones return as newer leave.
 * - Countdowns pause while the pointer or keyboard focus is on the stack, so a toast never leaves mid-read.
 * - The stack lifts above the chat composer whenever the two would overlap.
 */
export function NotificationViewport() {
  const t = useT()
  const notifications = useNotificationStore((state) => state.notifications)
  const expire = useNotificationStore((state) => state.expire)
  const pauseTimers = useNotificationStore((state) => state.pauseTimers)
  const resumeTimers = useNotificationStore((state) => state.resumeTimers)
  const stackRef = useRef<HTMLElement>(null)
  const [lift, setLift] = useState<number | null>(null)
  const visibleCount = Math.min(notifications.length, TOAST_MAX_VISIBLE)

  useLayoutEffect(() => {
    const stack = stackRef.current
    if (!stack || visibleCount === 0) return
    const update = () => setLift(measureLift(stack))
    update()
    window.addEventListener('resize', update)
    const composer = document.querySelector(PROTECTED_SURFACE)
    const observer = composer && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    if (composer) observer?.observe(composer)
    return () => {
      window.removeEventListener('resize', update)
      observer?.disconnect()
    }
  }, [visibleCount])

  if (notifications.length === 0) return null

  // The newest few: an older toast that is still open comes back once a newer one leaves.
  const visible = notifications.slice(-TOAST_MAX_VISIBLE)
  const liftStyle = lift !== null ? ({ '--ui-toast-lift': `${lift}px` } as CSSProperties) : undefined

  return (
    <section
      ref={stackRef}
      aria-label={t.notifications_region}
      className="notification-viewport notification-viewport--app"
      data-lifted={lift !== null || undefined}
      style={liftStyle}
      onPointerEnter={pauseTimers}
      onPointerLeave={resumeTimers}
      onFocus={pauseTimers}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) resumeTimers() }}
    >
      {visible.map((notification) => (
        <NotificationToast
          key={notification.id}
          tone={notification.tone}
          title={notification.title}
          message={notification.message}
          detail={notification.detail}
          actions={notification.actions}
          dismissLabel={notification.dismissible ? t.translate_error_dismiss : undefined}
          onDismiss={notification.dismissible ? () => expire(notification.id) : undefined}
          className="fade-in"
        />
      ))}
    </section>
  )
}
