import { forwardRef } from 'react'
import { Button, StatusDot, type StatusTone } from '../atoms'
import { ChevronDownIcon } from '../icons'

export interface ModelChipProps {
  /** Short provider name ("Local", "Gemini"). */
  providerLabel: string
  /** The raw model id, shown in monospace. */
  modelLabel: string
  /** Whether the model can answer right now (key present, runtime ready). */
  tone: StatusTone
  ariaLabel: string
  expanded: boolean
  onClick: () => void
}

/** The compact model control in a page header: status dot, provider · model, chevron. */
export const ModelChip = forwardRef<HTMLButtonElement, ModelChipProps>(function ModelChip(
  { providerLabel, modelLabel, tone, ariaLabel, expanded, onClick },
  ref,
) {
  return (
    <Button
      ref={ref}
      size="sm"
      shape="rect"
      variant={expanded ? 'primary' : 'neutral'}
      appearance={expanded ? 'soft' : 'outline'}
      aria-label={ariaLabel}
      aria-expanded={expanded}
      aria-haspopup="dialog"
      className="ui-model-chip"
      onClick={onClick}
    >
      <StatusDot tone={tone} />
      <span className="ui-model-chip__provider">{providerLabel} ·</span>
      <span className="ui-model-chip__model">{modelLabel}</span>
      <ChevronDownIcon className="ui-model-chip__chevron" aria-hidden="true" />
    </Button>
  )
})
