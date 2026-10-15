import { useState } from 'react'
import { PROVIDERS } from '../../constants/providers'
import { useAppStore, useT } from '../../store/useAppStore'
import { formatModelName } from '../../utils/modelDisplay'
import { ModelSelector } from '../ModelSelector'
import { AIModelField } from '../ui/molecules'

/**
 * Model field for a configuration section that also holds other settings.
 * It shows the active model like the Chat/Translate fields and expands the
 * searchable catalog in place, so the surrounding popover never nests a menu.
 */
export function AIModelPickerField() {
  const t = useT()
  const selectedProvider = useAppStore((state) => state.selectedProvider)
  const selectedModel = useAppStore((state) => state.selectedModels[state.selectedProvider])
  const [expanded, setExpanded] = useState(false)
  const modelLabel = formatModelName(selectedProvider, selectedModel)
  const providerLabel = PROVIDERS.find((provider) => provider.id === selectedProvider)?.name

  return (
    <>
      <AIModelField
        expanded={expanded}
        provider={selectedProvider}
        providerLabel={providerLabel}
        modelLabel={modelLabel}
        ariaLabel={`${t.model_picker_model}: ${modelLabel}`}
        onClick={() => setExpanded((value) => !value)}
      />
      {expanded && (
        <div className="ai-configuration-inline-picker">
          <ModelSelector
            embedded
            inline
            directModelList
            onOpenChange={(open) => {
              if (!open) setExpanded(false)
            }}
            onSelectionChange={() => setExpanded(false)}
          />
        </div>
      )}
    </>
  )
}
