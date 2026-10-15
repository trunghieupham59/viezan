import { RecoverableError } from '../ui/molecules'

interface TranslateErrorProps {
  error: string
  context: string
  /** True when error is due to missing/invalid API key — shows "Open Settings" button */
  isApiKeyError: boolean
  /** True when there is source text or image to retry */
  canRetry: boolean
  onRetry: () => void
  onDismiss: () => void
  onOpenSettings: () => void
  onChooseModel: () => void
  labelRetry: string
  labelChooseModel: string
  labelOpenSettings: string
  labelDismiss: string
}

export function TranslateError({
  error, context, isApiKeyError, canRetry,
  onRetry, onDismiss, onOpenSettings, onChooseModel,
  labelRetry, labelChooseModel, labelOpenSettings, labelDismiss,
}: TranslateErrorProps) {
  return (
    <RecoverableError
      message={error}
      context={context}
      retryAction={{ label: labelRetry, onClick: onRetry, disabled: !canRetry }}
      alternativeAction={{ label: labelChooseModel, onClick: onChooseModel }}
      settingsAction={isApiKeyError
        ? { label: labelOpenSettings, onClick: onOpenSettings }
        : undefined}
      dismissLabel={labelDismiss}
      onDismiss={onDismiss}
    />
  )
}
