import { Button } from './atoms'
/**
 * CheckUpdateButton — "Check for updates" button that adapts its appearance
 * to the current updater state (idle → checking → downloaded).
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
  const isDownloaded = status === 'downloaded'

  return (
    <Button
      size="sm"
      shape="rect"
      variant={isDownloaded ? 'primary' : 'neutral'}
      appearance={isDownloaded ? 'solid' : 'outline'}
      type="button"
      onClick={onClick}
      disabled={isDisabled}
    >
      {status === 'checking' && <SpinnerIcon className="w-3 h-3 animate-spin" />}
      {status === 'checking' ? checkingLabel : checkLabel}
    </Button>
  )
}
