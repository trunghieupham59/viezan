import { useT } from '../../store/useAppStore'
import { useNotificationStore } from '../../store/useNotificationStore'
import { NotificationToast } from '../ui/molecules'

/**
 * App-level toast stack at the top-right of the window. Every feature and
 * Settings section reports errors and confirmations here through
 * `useNotificationStore`, so no screen owns an inline banner of its own.
 */
export function NotificationViewport() {
  const t = useT()
  const notifications = useNotificationStore((state) => state.notifications)
  const expire = useNotificationStore((state) => state.expire)

  if (notifications.length === 0) return null

  return (
    <div className="notification-viewport notification-viewport--app">
      {notifications.map((notification) => (
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
    </div>
  )
}
