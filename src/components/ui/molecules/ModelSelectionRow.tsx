import type { FocusEventHandler } from 'react'
import { Button } from '../atoms'
import { CheckIcon, LockIcon, PlusIcon } from '../icons'

export interface ModelSelectionRowProps {
  modelName: string
  providerName: string
  selected: boolean
  disabled?: boolean
  statusLabel: string
  onSelect: () => void
  onFocus?: FocusEventHandler<HTMLButtonElement>
}

/** Selects a model for a future translation job; it never navigates existing results. */
export function ModelSelectionRow({
  modelName,
  providerName,
  selected,
  disabled = false,
  statusLabel,
  onSelect,
  onFocus,
}: ModelSelectionRowProps) {
  return (
    <Button
      size="md"
      shape="rect"
      variant={selected ? 'primary' : 'neutral'}
      appearance={selected ? 'soft' : 'ghost'}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${modelName} · ${providerName} · ${statusLabel}`}
      onClick={onSelect}
      onFocus={onFocus}
      className="model-selection-row"
    >
      <span className="model-selection-row__indicator" aria-hidden="true">
        {disabled ? <LockIcon /> : selected ? <CheckIcon /> : <PlusIcon />}
      </span>
      <span className="model-selection-row__copy">
        <strong>{modelName}</strong>
        <span>{providerName}</span>
      </span>
      <span className="model-selection-row__status">{statusLabel}</span>
    </Button>
  )
}
