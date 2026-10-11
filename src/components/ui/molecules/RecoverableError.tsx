import { Button } from '../atoms'
import { AlertTriangleIcon, XIcon } from '../icons'

export interface RecoverableErrorAction {
  label: string
  onClick: () => void
  disabled?: boolean
}

export interface RecoverableErrorProps {
  message: string
  context?: string
  retryAction?: RecoverableErrorAction
  alternativeAction?: RecoverableErrorAction
  settingsAction?: RecoverableErrorAction
  dismissLabel: string
  onDismiss: () => void
}

/** Safe error summary with explicit paths to retry or change configuration. */
export function RecoverableError({
  message,
  context,
  retryAction,
  alternativeAction,
  settingsAction,
  dismissLabel,
  onDismiss,
}: RecoverableErrorProps) {
  return (
    <div className="fade-in flex flex-col gap-2">
      <div className="ui-error-box flex items-start gap-2" role="alert">
        <AlertTriangleIcon className="ui-error-icon w-4 h-4 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="break-words">{message}</p>
          {context && <p className="ui-error-context">{context}</p>}
        </div>
        <Button
          size="sm"
          shape="icon"
          variant="danger"
          appearance="ghost"
          onClick={onDismiss}
          title={dismissLabel}
          className="mt-0.5 flex-shrink-0"
          aria-label={dismissLabel}
        >
          <XIcon className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {retryAction && (
          <Button
            size="sm"
            shape="rect"
            variant="neutral"
            appearance="outline"
            onClick={retryAction.onClick}
            disabled={retryAction.disabled}
          >
            {retryAction.label}
          </Button>
        )}
        {alternativeAction && (
          <Button
            size="sm"
            shape="rect"
            variant="primary"
            appearance="soft"
            onClick={alternativeAction.onClick}
            disabled={alternativeAction.disabled}
          >
            {alternativeAction.label}
          </Button>
        )}
        {settingsAction && (
          <Button
            size="sm"
            shape="rect"
            variant="neutral"
            appearance="ghost"
            onClick={settingsAction.onClick}
            disabled={settingsAction.disabled}
          >
            {settingsAction.label}
          </Button>
        )}
      </div>
    </div>
  )
}
