import { useCallback, useRef, useState } from 'react'
import { PROVIDERS } from '../../../constants/providers'
import { useAppStore, useT } from '../../../store/useAppStore'
import type { Provider } from '../../../types'
import { formatModelName } from '../../../utils/modelDisplay'
import { ModelSelector } from '../../ModelSelector'
import { ConfigSection, ModelChip } from '../../ui/molecules'
import { AIConfigurationPopover } from '../AIConfigurationPopover'

export interface ChatAIConfigurationProps {
  conversationId: string | null
  /** Defaults to binding the choice to `conversationId` (see below). */
  onSelectionChange?: (provider: Provider, model: string) => void
  /** Where the popover opens: below the page header, above the composer. */
  placement?: 'above' | 'below'
}

/**
 * The AI Chat model chip and its popover. The choice belongs to the
 * conversation that was active when the popover opened: model lists load
 * asynchronously, so a late answer must never rewrite a conversation the user
 * has switched to in the meantime.
 */
export function ChatAIConfiguration({
  conversationId,
  onSelectionChange,
  placement = 'below',
}: ChatAIConfigurationProps) {
  const t = useT()
  const setChatSessionModel = useAppStore((state) => state.setChatSessionModel)
  const bindToConversation = useCallback((provider: Provider, model: string) => {
    if (!conversationId) return
    const state = useAppStore.getState()
    if (state.activeChatSessionId !== conversationId || state.selectedProvider !== provider) return
    setChatSessionModel(conversationId, provider, model)
  }, [conversationId, setChatSessionModel])
  const applySelection = onSelectionChange ?? bindToConversation
  const selectedProvider = useAppStore((state) => state.selectedProvider)
  const selectedModel = useAppStore((state) => state.selectedModels[state.selectedProvider])
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const modelLabel = formatModelName(selectedProvider, selectedModel)
  const providerLabel = PROVIDERS.find((provider) => provider.id === selectedProvider)?.name
  const hasKey = useAppStore((state) => state.selectedProvider === 'local' || Boolean(state.keyStatus[state.selectedProvider]))

  const close = useCallback(() => {
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])

  return (
    <div className="ai-configuration-anchor">
      <ModelChip
        ref={triggerRef}
        expanded={open}
        tone={hasKey ? 'ok' : 'warning'}
        providerLabel={providerLabel ?? selectedProvider}
        modelLabel={selectedModel || modelLabel}
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
        placement={placement}
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
                applySelection(provider, model)
                close()
              }}
            />
          </div>
        </ConfigSection>
      </AIConfigurationPopover>
    </div>
  )
}
