import { Button } from './atoms'
/**
 * CheckUpdateButton — "Check for updates" button that adapts its appearance
 * to the current updater state (spinner while checking, disabled while busy).
 * Extracted from SettingsPage (Updates section).
 */
import { SpinnerIcon } from './icons'

export type UpdaterButtonStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error-codesign'
  | 'error'

interface CheckUpdateButtonProps {
  status: UpdaterButtonStatus
  checkLabel: string
  checkingLabel: string
  onClick: () => void
}

export function CheckUpdateButton({
  status,
  checkLabel,
  checkingLabel,
  onClick,
}: CheckUpdateButtonProps) {
  const isDisabled = status === 'checking' || status === 'downloading'

  // Always a bounded secondary control: once an update is downloaded the row's
  // single solid action is "Install & restart", so this never turns solid.
  return (
    <Button
      size="sm"
      shape="rect"
      variant="neutral"
      appearance="outline"
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      aria-busy={status === 'checking' || undefined}
    >
      {status === 'checking' && <SpinnerIcon className="w-3 h-3 animate-spin" />}
      {status === 'checking' ? checkingLabel : checkLabel}
    </Button>
  )
}
