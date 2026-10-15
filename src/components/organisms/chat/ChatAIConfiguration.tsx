import { useCallback, useRef, useState } from 'react'
import { PROVIDERS } from '../../../constants/providers'
import { useAppStore, useT } from '../../../store/useAppStore'
import type { Provider } from '../../../types'
import { formatModelName } from '../../../utils/modelDisplay'
import { ModelSelector } from '../../ModelSelector'
import { AIModelField, ConfigSection } from '../../ui/molecules'
import { AIConfigurationPopover } from '../AIConfigurationPopover'

export interface ChatAIConfigurationProps {
  conversationId: string | null
  onSelectionChange: (provider: Provider, model: string) => void
}

export function ChatAIConfiguration({
  conversationId,
  onSelectionChange,
}: ChatAIConfigurationProps) {
  const t = useT()
  const selectedProvider = useAppStore((state) => state.selectedProvider)
  const selectedModel = useAppStore((state) => state.selectedModels[state.selectedProvider])
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const modelLabel = formatModelName(selectedProvider, selectedModel)
  const providerLabel = PROVIDERS.find((provider) => provider.id === selectedProvider)?.name

  const close = useCallback(() => {
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])

  return (
    <div className="ai-configuration-anchor">
      <AIModelField
        ref={triggerRef}
        compact
        expanded={open}
        provider={selectedProvider}
        providerLabel={providerLabel}
        modelLabel={modelLabel}
        ariaLabel={`${t.model_picker_model}: ${modelLabel}`}
        onClick={() => setOpen((value) => !value)}
      />
      <AIConfigurationPopover
        open={open}
        title={t.ai_configuration_title}
        scopeDescription={conversationId
          ? t.ai_configuration_chat_scope
          : t.ai_configuration_new_chat_scope}
        closeLabel={t.settings_close}
        triggerRef={triggerRef}
        placement="above"
        onClose={close}
      >
        <ConfigSection title={t.ai_configuration_models_section}>
          <div className="ai-configuration-inline-picker">
            <ModelSelector
              embedded
              inline
              directModelList
              selectionContextKey={conversationId}
              onSelectionChange={(provider, model) => {
                onSelectionChange(provider, model)
                close()
              }}
            />
          </div>
        </ConfigSection>
      </AIConfigurationPopover>
    </div>
  )
}
