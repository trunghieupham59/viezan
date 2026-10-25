import { type ReactNode, useEffect, useId, useState } from 'react'
import { Button } from './atoms'
import { CheckCircleIcon, CheckIcon, SpinnerIcon, TrashIcon } from './icons'
import { StatusLabel } from './molecules/StatusLabel'


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
  // Focusing a saved key's masked value starts a replacement: the field empties
  // and accepts typing, and shows the saved mask again if left empty.
  const [replacing, setReplacing] = useState(false)
  const masked = showMasked && !replacing

  const handleInputChange = (value: string) => {
    onInputChange(value)
    onStatusReset?.()
  }

  return (
    <div className="flex gap-2">
      <div className="flex-1 relative">
        <input
          type="password"
          value={masked ? (maskedValue ?? '********************************') : inputValue}
          readOnly={masked}
          onChange={masked ? undefined : (e) => handleInputChange(e.target.value)}
          onFocus={masked ? () => setReplacing(true) : undefined}
          onBlur={() => { if (inputValue === '') setReplacing(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !masked && !e.nativeEvent.isComposing) onSubmit() }}
          placeholder={placeholder}
          className={[
            'field-input field-input-mono',
            masked
              ? 'field-input-muted'
              : isSuccess
                ? 'field-input-success'
                : isError
                  ? 'field-input-error'
                  : '',
            // Reserve room for the inline delete control so the masked value never sits under it.
            showMasked && hasSecret ? 'pr-10' : '',
          ].join(' ')}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {showMasked && hasSecret && (
          <Button
            size="xs"
            shape="icon"
            variant="danger"
            appearance="soft"
            aria-label={labels.remove}
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            title={labels.remove}
            className="absolute right-1 top-1/2 -translate-y-1/2"
          >
            {isDeleting ? (
              <SpinnerIcon className="w-4 h-4 animate-spin" />
            ) : (
              <TrashIcon className="w-4 h-4" />
            )}
          </Button>
        )}
      </div>

      {!masked && (
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

interface CredentialCardProps {
  /** Kept for callers; the row reads by name alone, as in the design. */
  icon?: ReactNode
  title: string
  docsLabel: string
  labels: CredentialLabels & {
    /** "Edit" for a saved key, "Add key" otherwise. */
    edit?: string
    add?: string
  }
  inputValue: string
  maskedValue: string | null
  placeholder: string
  hasSecret: boolean
  isBusy?: boolean
  isSuccess?: boolean
  isError?: boolean
  isDeleting?: boolean
  meta?: ReactNode
  onOpenDocs: () => void
  onInputChange: (value: string) => void
  onSubmit: () => void
  onDelete: () => void
  onStatusReset?: () => void
}

/**
 * One credential as a settings row: the provider's name, its key state and
 * one action. The key editor opens under the row on demand, and stays open
 * while a key is being typed, verified or has failed.
 */
export function CredentialCard({
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
  meta,
  onOpenDocs,
  onInputChange,
  onSubmit,
  onDelete,
  onStatusReset,
}: CredentialCardProps) {
  const [editing, setEditing] = useState(false)
  const editorId = useId()
  const showMasked = hasSecret && inputValue === ''
  const open = editing || inputValue !== '' || isBusy || isError

  // A verified key closes the editor; the row's status says it is saved.
  useEffect(() => {
    if (isSuccess) setEditing(false)
  }, [isSuccess])

  const tone = isError ? 'danger' : hasSecret || isSuccess ? 'ok' : 'neutral'
  const status = isError ? labels.invalid : hasSecret || isSuccess ? labels.saved : labels.empty

  return (
    <div className="ui-settings-row credential-row" data-open={open || undefined}>
      <div className="ui-settings-row__main">
        <div className="ui-settings-row__copy">
          <span className="ui-settings-row__label">{title}</span>
          <span className="ui-settings-row__description credential-row__meta">
            {/* Native exception: text link in copy, not a boxed control (see .settings-inline-link). */}
            <button type="button" className="settings-inline-link" onClick={onOpenDocs}>
              {docsLabel}
            </button>
            {meta}
          </span>
        </div>
        <div className="ui-settings-row__controls">
          <StatusLabel tone={tone}>{status}</StatusLabel>
          <Button
            size="sm"
            shape="rect"
            variant="neutral"
            appearance={open ? 'soft' : 'outline'}
            aria-expanded={open}
            aria-controls={editorId}
            onClick={() => setEditing((value) => !value)}
          >
            {hasSecret ? (labels.edit ?? labels.submit) : (labels.add ?? labels.submit)}
          </Button>
        </div>
      </div>

      {open && (
        <div id={editorId} className="ui-settings-row__below">
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
        </div>
      )}
    </div>
  )
}
