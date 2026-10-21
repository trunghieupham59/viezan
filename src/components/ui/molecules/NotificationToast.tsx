import { Button } from '../atoms/Button'
import { AlertTriangleIcon, CheckCircleIcon, InfoCircleIcon, XIcon } from '../icons'

export type NotificationToastTone = 'info' | 'success' | 'warning' | 'error'

export interface NotificationToastAction {
  label: string
  onClick: () => void
  disabled?: boolean
}

export interface NotificationToastProps {
  tone?: NotificationToastTone
  title?: string
  message: string
  /** Secondary line under the message, e.g. which provider/model failed. */
  detail?: string
  /** Recovery paths; the first one is emphasised as the primary action. */
  actions?: NotificationToastAction[]
  /** Single-action shorthand, kept for existing callers; rendered after `actions`. */
  actionLabel?: string
  onAction?: () => void
  dismissLabel?: string
  onDismiss?: () => void
  className?: string
}

function NotificationIcon({ tone }: { tone: NotificationToastTone }) {
  if (tone === 'success') return <CheckCircleIcon className="h-4 w-4" />
  if (tone === 'info') return <InfoCircleIcon className="h-4 w-4" />
  return <AlertTriangleIcon className="h-4 w-4" />
}

/** Props-driven notification surface; viewport placement remains with its owner. */
export function NotificationToast({
  tone = 'info',
  title,
  message,
  detail,
  actions,
  actionLabel,
  onAction,
  dismissLabel,
  onDismiss,
  className = '',
}: NotificationToastProps) {
  const role = tone === 'error' ? 'alert' : 'status'
  const allActions: NotificationToastAction[] = [
    ...(actions ?? []),
    ...(actionLabel && onAction ? [{ label: actionLabel, onClick: onAction }] : []),
  ]

  return (
    <section
      className={`notification-toast notification-toast--${tone}${className ? ` ${className}` : ''}`}
      role={role}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
    >
      <span className="notification-toast-icon" aria-hidden="true">
        <NotificationIcon tone={tone} />
      </span>
      <span className="notification-toast-copy">
        {title && <span className="notification-toast-title">{title}</span>}
        <span className="notification-toast-message">{message}</span>
        {detail && <span className="notification-toast-detail">{detail}</span>}
        {allActions.length > 0 && (
          <span className="notification-toast-footer">
            {allActions.map((action, index) => (
              <Button
                key={action.label}
                size="sm"
                shape="pill"
                variant={index === 0 ? 'primary' : 'neutral'}
                appearance={index === 0 ? 'outline' : 'ghost'}
                disabled={action.disabled}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ))}
          </span>
        )}
      </span>
      {onDismiss && dismissLabel && (
        <span className="notification-toast-actions">
          <Button
            size="sm"
            shape="icon"
            variant="neutral"
            appearance="ghost"
            onClick={onDismiss}
            title={dismissLabel}
            aria-label={dismissLabel}
          >
            <XIcon className="h-3.5 w-3.5" />
          </Button>
        </span>
      )}
    </section>
  )
}
