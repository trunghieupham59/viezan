import { Button } from './atoms'
/**
 * SettingsFormActions — cancel + submit button pair for settings forms.
 * Handles optional submitting spinner and disabled state.
 * Extracted from SettingsPage (preset add/edit forms, token create form).
 */
import { SpinnerIcon } from './icons'

interface SettingsFormActionsProps {
  onCancel: () => void
  onSubmit: () => void
  cancelLabel: string
  submitLabel: string
  /** Disables the submit button (e.g. when required fields are empty). */
  disabled?: boolean
  /** Shows a spinner on the submit button while an async action is running. */
  submitting?: boolean
  /**
   * 'sm' → compact controls (32px)
   * 'md' → default form controls (36px)
   */
  size?: 'sm' | 'md'
  /** Adds pt-1 top-padding to the container row. */
  topPadding?: boolean
}

export function SettingsFormActions({
  onCancel,
  onSubmit,
  cancelLabel,
  submitLabel,
  disabled = false,
  submitting = false,
  size = 'md',
  topPadding = false,
}: SettingsFormActionsProps) {
  return (
    <div className={`flex gap-2 justify-end${topPadding ? ' pt-1' : ''}`}>
      <Button
        size={size}
        shape="rect"
        variant="neutral"
        appearance="outline"
        type="button"
        onClick={onCancel}
      >
        {cancelLabel}
      </Button>
      <Button
        size={size}
        shape="rect"
        variant="primary"
        appearance="solid"
        type="button"
        onClick={onSubmit}
        disabled={disabled || submitting}
      >
        {submitting && <SpinnerIcon className="w-3 h-3 animate-spin" />}
        {submitLabel}
      </Button>
    </div>
  )
}
