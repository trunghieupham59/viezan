import { Button } from './atoms'
import { AlertTriangleIcon, XIcon } from './icons'

export interface InlineErrorBannerProps {
  message: string
  onDismiss?: () => void
  dismissLabel?: string
  retryLabel?: string
  onRetry?: () => void
}

/**
 * Inline error banner — displays an error message with optional dismiss (X)
 * and retry actions. Reusable across settings sections.
 */
export function InlineErrorBanner({
  message,
  onDismiss,
  dismissLabel,
  retryLabel,
  onRetry,
}: InlineErrorBannerProps) {
  return (
    <div className="ui-error-banner flex items-center gap-2">
      <AlertTriangleIcon className="ui-error-icon w-3.5 h-3.5" />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <Button
          size="sm"
          shape="icon"
          variant="neutral"
          appearance="ghost"
          aria-label={dismissLabel}
          type="button"
          onClick={onDismiss}
        >
          <XIcon className="w-3 h-3" />
        </Button>
      )}
      {onRetry && retryLabel && (
        <Button
          size="sm"
          shape="rect"
          variant="neutral"
          appearance="ghost"
          type="button"
          onClick={onRetry}
        >
          {retryLabel}
        </Button>
      )}
    </div>
  )
}
