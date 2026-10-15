import { forwardRef } from 'react'
import type { Provider } from '../../../types'
import { ProviderIcon } from '../../ProviderIcon'
import { Button } from '../atoms'
import { ChevronRightIcon, LayersIcon } from '../icons'

export interface AIModelFieldProps {
  ariaLabel: string
  modelLabel: string
  provider?: Provider
  providerLabel?: string
  multiple?: boolean
  compact?: boolean
  expanded?: boolean
  disabled?: boolean
  onClick: () => void
}

export const AIModelField = forwardRef<HTMLButtonElement, AIModelFieldProps>(function AIModelField({
  ariaLabel,
  modelLabel,
  provider,
  providerLabel,
  multiple = false,
  compact = false,
  expanded = false,
  disabled = false,
  onClick,
}, ref) {
  return (
    <Button
      ref={ref}
      size="md"
      shape={compact ? 'pill' : 'rect'}
      variant={expanded ? 'primary' : 'neutral'}
      appearance={expanded ? 'soft' : compact ? 'ghost' : 'outline'}
      aria-label={ariaLabel}
      aria-expanded={expanded}
      aria-haspopup="dialog"
      disabled={disabled}
      onClick={onClick}
      className={`ai-model-field${compact ? ' ai-model-field--compact' : ''}`}
    >
      {multiple
        ? <LayersIcon aria-hidden="true" />
        : provider && <ProviderIcon provider={provider} />}
      <span className="ai-model-field__copy">
        <span className="ai-model-field__model">{modelLabel}</span>
        {providerLabel && <span className="ai-model-field__provider">{providerLabel}</span>}
      </span>
      <ChevronRightIcon className="ai-model-field__chevron" aria-hidden="true" />
    </Button>
  )
})
