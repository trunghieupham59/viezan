import type { ReactNode } from 'react'
import { Button } from './atoms'
import { CheckCircleIcon, CheckIcon, SpinnerIcon, TrashIcon } from './icons'

export type CredentialMessageTone = 'success' | 'warning' | 'error'

interface CredentialLabels {
  saved: string
  empty: string
  invalid: string
  remove: string
  verifying: string
  verified: string
  tryAgain: string
  submit: string
}

interface CredentialStatusBadgeProps {
  hasSecret: boolean
  isSuccess?: boolean
  isError?: boolean
  labels: Pick<CredentialLabels, 'saved' | 'empty' | 'invalid'>
}

export function CredentialStatusBadge({ hasSecret, isSuccess = false, isError = false, labels }: CredentialStatusBadgeProps) {
  if (isError) {
    return (
      <span className="ui-badge ui-badge-danger flex-shrink-0">
        <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
          <span className="ui-status-ping-danger animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" />
          <span className="ui-status-dot ui-status-dot-danger relative inline-flex" />
        </span>
        {labels.invalid}
      </span>
    )
  }

  if (isSuccess || hasSecret) {
    return (
      <span className="ui-badge flex-shrink-0">
        <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
          <span className={[
            'absolute inline-flex h-full w-full rounded-full bg-gray-400 opacity-75',
            isSuccess ? 'animate-ping' : 'animate-pulse',
          ].join(' ')} />
          <span className="ui-status-dot relative inline-flex bg-gray-500" />
        </span>
        {labels.saved}
      </span>
    )
  }

  return (
    <span className="ui-badge ui-badge-muted flex-shrink-0">
      <span className="ui-status-dot" />
      {labels.empty}
    </span>
  )
}

interface CredentialSecretInputRowProps {
  inputValue: string
  maskedValue: string | null
  showMasked: boolean
  placeholder: string
  hasSecret: boolean
  isBusy?: boolean
  isSuccess?: boolean
  isError?: boolean
  isDeleting?: boolean
  labels: Pick<CredentialLabels, 'remove' | 'verifying' | 'verified' | 'tryAgain' | 'submit'>
  onInputChange: (value: string) => void
  onSubmit: () => void
  onDelete: () => void
  onStatusReset?: () => void
}

export function CredentialSecretInputRow({
  inputValue,
  maskedValue,
  showMasked,
  placeholder,
  hasSecret,
  isBusy = false,
  isSuccess = false,
  isError = false,
  isDeleting = false,
  labels,
  onInputChange,
  onSubmit,
  onDelete,
  onStatusReset,
}: CredentialSecretInputRowProps) {
  const handleInputChange = (value: string) => {
    onInputChange(value)
    onStatusReset?.()
  }

  return (
    <div className="flex gap-2">
      <div className="flex-1 relative">
        <input
          type="password"
          value={showMasked ? (maskedValue ?? '********************************') : inputValue}
          readOnly={showMasked}
          onChange={showMasked ? undefined : (e) => handleInputChange(e.target.value)}
          onClick={showMasked ? () => onInputChange('') : undefined}
          onKeyDown={(e) => { if (e.key === 'Enter' && !showMasked) onSubmit() }}
          placeholder={placeholder}
          className={[
            'field-input field-input-mono',
            showMasked
              ? 'field-input-muted'
              : isSuccess
                ? 'field-input-success'
                : isError
                  ? 'field-input-error'
                  : '',
          ].join(' ')}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {showMasked && hasSecret && (
          <Button
            size="md"
            shape="icon"
            variant="danger"
            appearance="soft"
            aria-label={labels.remove}
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            title={labels.remove}
            className="absolute right-2 top-1/2 -translate-y-1/2"
          >
            {isDeleting ? (
              <SpinnerIcon className="w-4 h-4 animate-spin" />
            ) : (
              <TrashIcon className="w-4 h-4" />
            )}
          </Button>
        )}
      </div>

      {!showMasked && (
        <Button
          size="md"
          shape="rect"
          variant={isError ? 'danger' : 'primary'}
          appearance="solid"
          type="button"
          onClick={onSubmit}
          disabled={!inputValue.trim() || isBusy}
          className="whitespace-nowrap"
        >
          {isBusy ? (
            <>
              <SpinnerIcon className="w-4 h-4 animate-spin" />
              {labels.verifying}
            </>
          ) : isSuccess ? (
            <>
              <CheckIcon className="w-4 h-4" />
              {labels.verified}
            </>
          ) : isError ? (
            labels.tryAgain
          ) : (
            <>
              <CheckCircleIcon className="w-4 h-4" />
              {labels.submit}
            </>
          )}
        </Button>
      )}
    </div>
  )
}

interface CredentialStatusMessageProps {
  message: string
  tone: CredentialMessageTone
}

export function CredentialStatusMessage({ message, tone }: CredentialStatusMessageProps) {
  return (
    <div className={[
      'px-3 py-2 rounded-lg text-xs font-medium',
      tone === 'success'
        ? 'bg-gray-50 text-gray-700 dark:bg-gray-900/20 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
        : 'ui-error-box text-xs font-medium',
    ].join(' ')}>
      {message}
    </div>
  )
}

interface CredentialCardProps {
  icon: ReactNode
  title: string
  docsLabel: string
  labels: CredentialLabels
  inputValue: string
  maskedValue: string | null
  placeholder: string
  hasSecret: boolean
  isBusy?: boolean
  isSuccess?: boolean
  isError?: boolean
  isDeleting?: boolean
  statusMessage?: { text: string; tone: CredentialMessageTone }
  meta?: ReactNode
  onOpenDocs: () => void
  onInputChange: (value: string) => void
  onSubmit: () => void
  onDelete: () => void
  onStatusReset?: () => void
}

export function CredentialCard({
  icon,
  title,
  docsLabel,
  labels,
  inputValue,
  maskedValue,
  placeholder,
  hasSecret,
  isBusy = false,
  isSuccess = false,
  isError = false,
  isDeleting = false,
  statusMessage,
  meta,
  onOpenDocs,
  onInputChange,
  onSubmit,
  onDelete,
  onStatusReset,
}: CredentialCardProps) {
  const showMasked = hasSecret && inputValue === ''

  return (
    <div className="card p-4 space-y-3 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gray-100 dark:bg-gray-700 flex-shrink-0">
            {icon}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
            <Button
              size="md"
              shape="rect"
              variant="neutral"
              appearance="ghost"
              type="button"
              onClick={onOpenDocs}
            >
              {docsLabel}
            </Button>
            {meta && <div className="mt-1">{meta}</div>}
          </div>
        </div>
        <CredentialStatusBadge
          hasSecret={hasSecret}
          isSuccess={isSuccess}
          isError={isError}
          labels={labels}
        />
      </div>

      <CredentialSecretInputRow
        inputValue={inputValue}
        maskedValue={maskedValue}
        showMasked={showMasked}
        placeholder={placeholder}
        hasSecret={hasSecret}
        isBusy={isBusy}
        isSuccess={isSuccess}
        isError={isError}
        isDeleting={isDeleting}
        labels={labels}
        onInputChange={onInputChange}
        onSubmit={onSubmit}
        onDelete={onDelete}
        onStatusReset={onStatusReset}
      />

      {statusMessage && (
        <CredentialStatusMessage message={statusMessage.text} tone={statusMessage.tone} />
      )}
    </div>
  )
}
