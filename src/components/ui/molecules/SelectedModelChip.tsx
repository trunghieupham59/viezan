import type { Provider } from '../../../types'
import { ProviderIcon } from '../../ProviderIcon'
import { Button } from '../atoms'
import { XIcon } from '../icons'

export interface SelectedModelChipProps {
  provider: Provider
  modelName: string
  providerName: string
  positionLabel: string
  removeLabel: string
  onRemove: () => void
}

/** A model selection control. It is never used to navigate translation results. */
export function SelectedModelChip({
  provider,
  modelName,
  providerName,
  positionLabel,
  removeLabel,
  onRemove,
}: SelectedModelChipProps) {
  return (
    <fieldset className="selected-model-chip">
      <legend className="sr-only">{modelName} · {providerName}</legend>
      <span className="selected-model-chip__position">{positionLabel}</span>
      <span className="selected-model-chip__icon" aria-hidden="true">
        <ProviderIcon provider={provider} />
      </span>
      <span className="selected-model-chip__copy">
        <strong>{modelName}</strong>
        <span>{providerName}</span>
      </span>
      <Button
        size="xs"
        shape="icon"
        variant="neutral"
        appearance="ghost"
        aria-label={`${removeLabel}: ${modelName}`}
        onClick={onRemove}
      >
        <XIcon />
      </Button>
    </fieldset>
  )
}
