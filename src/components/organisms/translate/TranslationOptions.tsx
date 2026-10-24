import { useCallback, useId, useRef, useState } from 'react'
import { PROVIDERS } from '../../../constants/providers'
import { useT } from '../../../store/useAppStore'
import type {
  PhoneticMode,
  TranslationModelSelection,
  TranslationReasoningEffort,
  TranslationStyle,
} from '../../../types'
import { formatModelName } from '../../../utils/modelDisplay'
import { TranslateToolbar } from '../../translate/TranslateToolbar'
import { Button } from '../../ui/atoms'
import { GearIcon } from '../../ui/icons'
import { AIModelField, ConfigSection, type SelectFieldOption } from '../../ui/molecules'
import { AIConfigurationPopover } from '../AIConfigurationPopover'
import { TranslationModelDialog } from './TranslationModelDialog'

export interface TranslationOptionsProps {
  translationStyle: TranslationStyle
  onStyleChange: (style: TranslationStyle) => void
  reasoningEffort: TranslationReasoningEffort
  onReasoningEffortChange: (effort: TranslationReasoningEffort) => void
  autoTranslate: boolean
  onAutoTranslateChange: (value: boolean) => void
  phoneticMode: PhoneticMode
  onPhoneticModeChange: (mode: PhoneticMode) => void
  isPhoneticLoading: boolean
  isComparisonMode: boolean
  translationModels: TranslationModelSelection[]
  onTranslationModelsChange: (models: TranslationModelSelection[]) => void
  modelsOpen: boolean
  onModelsOpenChange: (open: boolean) => void
  onOpenSettings: () => void
}

/**
 * The Translate page's options: one header button opening the AI configuration
 * popover (models, style, reading, reasoning, auto-translate) and the focused
 * dialog for choosing up to three models.
 */
export function TranslationOptions({
  translationStyle,
  onStyleChange,
  reasoningEffort,
  onReasoningEffortChange,
  autoTranslate,
  onAutoTranslateChange,
  phoneticMode,
  onPhoneticModeChange,
  isPhoneticLoading,
  isComparisonMode,
  translationModels,
  onTranslationModelsChange,
  modelsOpen,
  onModelsOpenChange,
  onOpenSettings,
}: TranslationOptionsProps) {
  const t = useT()
  const optionsId = useId()
  const modelsId = useId()
  const optionsTriggerRef = useRef<HTMLButtonElement>(null)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const primaryModel = translationModels[0]
  const primaryModelLabel = primaryModel
    ? formatModelName(primaryModel.provider, primaryModel.model)
    : t.translate_models_none_selected
  const primaryProviderLabel = primaryModel
    ? PROVIDERS.find((provider) => provider.id === primaryModel.provider)?.name
    : undefined

  const styleLabels: Record<TranslationStyle, string> = {
    general: t.translate_style_general,
    formal: t.translate_style_formal,
    casual: t.translate_style_casual,
    business: t.translate_style_business,
    technical: t.translate_style_technical,
    natural: t.translate_style_natural,
  }
  const styleOptions: readonly SelectFieldOption[] = [
    { value: 'general', label: styleLabels.general, description: t.translate_style_general_desc },
    { value: 'formal', label: styleLabels.formal, description: t.translate_style_formal_desc },
    { value: 'casual', label: styleLabels.casual, description: t.translate_style_casual_desc },
    { value: 'business', label: styleLabels.business, description: t.translate_style_business_desc },
    { value: 'technical', label: styleLabels.technical, description: t.translate_style_technical_desc },
    { value: 'natural', label: styleLabels.natural, description: t.translate_style_natural_desc },
  ]
  const phoneticLabels: Record<Exclude<PhoneticMode, 'off'>, string> = {
    standard: t.translate_phonetic_standard,
    phonetic: t.translate_phonetic_transcription,
  }
  const reasoningLabels: Record<Exclude<TranslationReasoningEffort, 'auto'>, string> = {
    low: t.translate_reasoning_low,
    medium: t.translate_reasoning_medium,
    high: t.translate_reasoning_high,
  }
  // Comparison runs every model without a phonetic pass, so the summary must not
  // advertise a reading mode that produces nothing.
  const phoneticActive = phoneticMode !== 'off' && !isComparisonMode
  const activeOptionsSummary = [
    translationStyle !== 'general' ? styleLabels[translationStyle] : null,
    phoneticActive ? phoneticLabels[phoneticMode as Exclude<PhoneticMode, 'off'>] : null,
    reasoningEffort !== 'auto' ? reasoningLabels[reasoningEffort] : null,
  ].filter(Boolean).join(' · ')
  const hasCustomOptions = translationStyle !== 'general'
    || reasoningEffort !== 'auto'
    || phoneticMode !== 'off'

  const closeOptions = useCallback(() => {
    setOptionsOpen(false)
    optionsTriggerRef.current?.focus()
  }, [])
  const closeModels = useCallback(() => {
    onModelsOpenChange(false)
    requestAnimationFrame(() => optionsTriggerRef.current?.focus())
  }, [onModelsOpenChange])

  const resetOptions = () => {
    onStyleChange('general')
    onReasoningEffortChange('auto')
    onPhoneticModeChange('off')
  }

  return (
    <>
          <div className="ai-configuration-anchor">
            <Button
              ref={optionsTriggerRef}
              size="sm"
              shape="icon"
              variant={optionsOpen ? 'primary' : 'neutral'}
              appearance={optionsOpen ? 'soft' : 'ghost'}
              aria-expanded={optionsOpen}
              aria-controls={optionsId}
              aria-haspopup="dialog"
              aria-label={`${t.ai_configuration_title}, ${t.translate_models_trigger(translationModels.length)}`}
              title={activeOptionsSummary ? `${t.ai_configuration_title} · ${activeOptionsSummary}` : t.ai_configuration_title}
              onClick={() => {
                setOptionsOpen((open) => !open)
                onModelsOpenChange(false)
              }}
              className="translate-options-trigger"
            >
              <GearIcon />
            </Button>

            <AIConfigurationPopover
              id={optionsId}
              open={optionsOpen}
              title={t.ai_configuration_title}
              scopeDescription={t.ai_configuration_translate_scope}
              closeLabel={t.settings_close}
              triggerRef={optionsTriggerRef}
              onClose={closeOptions}
            >
              <ConfigSection title={t.ai_configuration_models_section}>
                <AIModelField
                  multiple={translationModels.length > 1}
                  provider={translationModels.length === 1 ? primaryModel?.provider : undefined}
                  providerLabel={translationModels.length === 1 ? primaryProviderLabel : undefined}
                  modelLabel={translationModels.length > 1
                    ? t.translate_models_trigger(translationModels.length)
                    : primaryModelLabel}
                  ariaLabel={t.translate_models_trigger_label(translationModels.length)}
                  onClick={() => {
                    setOptionsOpen(false)
                    onModelsOpenChange(true)
                  }}
                />
              </ConfigSection>

              <ConfigSection title={t.ai_configuration_translation_section}>
                <TranslateToolbar
                  hideModelSelector
                  autoToggleDisabled={isComparisonMode}
                  titleAutoDisabled={t.translate_models_manual_notice}
                  translationStyle={translationStyle}
                  onStyleChange={onStyleChange}
                  reasoningEffort={reasoningEffort}
                  onReasoningEffortChange={onReasoningEffortChange}
                  autoTranslate={autoTranslate}
                  onAutoTranslateChange={onAutoTranslateChange}
                  phoneticMode={phoneticMode}
                  onPhoneticModeChange={onPhoneticModeChange}
                  isPhoneticLoading={isPhoneticLoading && !isComparisonMode}
                  phoneticDisabled={isComparisonMode}
                  labelPhoneticUnsupported={t.translate_phonetic_compare_unsupported}
                  labelModel={t.model_picker_model}
                  labelReasoning={t.translate_reasoning_label}
                  labelReasoningAuto={t.translate_reasoning_auto}
                  labelReasoningLow={t.translate_reasoning_low}
                  labelReasoningMedium={t.translate_reasoning_medium}
                  labelReasoningHigh={t.translate_reasoning_high}
                  labelReasoningUnsupported={t.translate_reasoning_unsupported}
                  labelStyleLabel={t.translate_style_label}
                  styleOptions={styleOptions}
                  labelPhoneticSection={t.translate_phonetic}
                  labelPhoneticOff={t.translate_phonetic_off}
                  labelPhoneticStandard={t.translate_phonetic_standard}
                  labelPhoneticTranscription={t.translate_phonetic_transcription}
                  labelAutoSection={t.settings_auto_translate}
                  titleAutoMode={t.translate_mode_auto_title}
                  titleManualMode={t.translate_mode_manual_title}
                  labelAutoMode={t.translate_mode_auto}
                />
              </ConfigSection>

              {hasCustomOptions && (
                <footer className="translate-options-panel-footer">
                  <Button
                    size="sm"
                    shape="rect"
                    variant="neutral"
                    appearance="ghost"
                    onClick={resetOptions}
                  >
                    {t.translate_settings_reset}
                  </Button>
                </footer>
              )}
            </AIConfigurationPopover>
          </div>

      {modelsOpen && (
        <TranslationModelDialog
          id={modelsId}
          models={translationModels}
          onApply={onTranslationModelsChange}
          onCancel={closeModels}
          onOpenSettings={onOpenSettings}
        />
      )}
    </>
  )
}
