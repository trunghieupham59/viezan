import { Button } from './atoms'
/**
 * PresetActions — icon-button row for a single system-prompt preset item.
 * Renders: Set Default (conditional) · Apply · Edit · Delete.
 * Extracted from SettingsPage (AI Chat › Preset list › View mode).
 */
import { CheckIcon, ClipboardIcon, PencilIcon, TrashIcon } from './icons'

interface PresetActionsProps {
  isDefault: boolean
  onSetDefault: () => void
  onApply: () => void
  onEdit: () => void
  onDelete: () => void
  setDefaultTitle: string
  applyTitle: string
  editTitle: string
  deleteTitle: string
}

export function PresetActions({
  isDefault,
  onSetDefault,
  onApply,
  onEdit,
  onDelete,
  setDefaultTitle,
  applyTitle,
  editTitle,
  deleteTitle,
}: PresetActionsProps) {
  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      {/* Set default */}
      {!isDefault && (
        <Button
          size="sm"
          shape="icon"
          variant="neutral"
          appearance="ghost"
          aria-label={setDefaultTitle}
          type="button"
          onClick={onSetDefault}
          title={setDefaultTitle}
        >
          <CheckIcon />
        </Button>
      )}
      {/* Apply to current prompt */}
      <Button
        size="sm"
        shape="icon"
        variant="neutral"
        appearance="ghost"
        aria-label={applyTitle}
        type="button"
        onClick={onApply}
        title={applyTitle}
      >
        <ClipboardIcon className="w-3.5 h-3.5" />
      </Button>
      {/* Edit */}
      <Button
        size="sm"
        shape="icon"
        variant="neutral"
        appearance="ghost"
        type="button"
        onClick={onEdit}
        aria-label={editTitle}
        title={editTitle}
      >
        <PencilIcon />
      </Button>
      {/* Delete */}
      <Button
        size="sm"
        shape="icon"
        variant="danger"
        appearance="soft"
        aria-label={deleteTitle}
        type="button"
        onClick={onDelete}
        title={deleteTitle}
      >
        <TrashIcon />
      </Button>
    </div>
  )
}
