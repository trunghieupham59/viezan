import { useId, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import type { PhoneticMode, TranslationReasoningEffort, TranslationStyle } from '../../types'
import { getEffectiveTranslationReasoningEffort, getTranslationReasoningEfforts } from '../../utils/translationReasoning'
import { type ModelPickerInlineView, ModelSelector } from '../ModelSelector'
import { AutoTranslateToggle } from '../ui/AutoTranslateToggle'
import { SelectField } from '../ui/molecules'

export type TranslateSettingsSubview = ModelPickerInlineView

interface TranslateToolbarProps {
  translationStyle: TranslationStyle
  onStyleChange: (style: TranslationStyle) => void
  reasoningEffort: TranslationReasoningEffort
  onReasoningEffortChange: (effort: TranslationReasoningEffort) => void
  autoTranslate: boolean
  onAutoTranslateChange: (v: boolean) => void
  phoneticMode: PhoneticMode
  onPhoneticModeChange: (mode: PhoneticMode) => void
  isPhoneticLoading: boolean
  /** When true, hides the embedded ModelSelector (useful when parent renders it separately) */
  hideModelSelector?: boolean
  /** When true, the owning surface renders the always-visible Auto/Manual control. */
  hideAutoToggle?: boolean
  /** Keeps the model drill-down inside this toolbar surface. */
  inlineModelSelector?: boolean
  modelPickerCloseRequest?: number
  onModelPickerViewChange?: (view: ModelPickerInlineView | null) => void
  // i18n
  labelModel: string
  labelReasoning: string
  labelReasoningAuto: string
  labelReasoningLow: string
  labelReasoningMedium: string
  labelReasoningHigh: string
  labelReasoningUnsupported: string
  labelStyleLabel: string
  labelStyleGeneral: string
  labelStyleFormal: string
  labelStyleCasual: string
  labelStyleBusiness: string
  labelStyleTechnical: string
  labelStyleNatural: string
  labelPhoneticOff: string
  labelPhoneticStandard: string
  labelPhoneticTranscription: string
  /** Short title displayed above the phonetic dropdown */
  labelPhoneticSection: string
  /** Short title displayed above the auto/manual toggle */
  labelAutoSection: string
  titleAutoMode: string
  titleManualMode: string
  labelAutoMode: string
}

export function TranslateToolbar({
  translationStyle, onStyleChange,
  reasoningEffort, onReasoningEffortChange,
  autoTranslate, onAutoTranslateChange,
  phoneticMode, onPhoneticModeChange, isPhoneticLoading,
  hideModelSelector = false,
  hideAutoToggle = false,
  inlineModelSelector = false,
  modelPickerCloseRequest = 0,
  onModelPickerViewChange,
  labelModel,
  labelReasoning,
  labelReasoningAuto, labelReasoningLow, labelReasoningMedium, labelReasoningHigh,
  labelReasoningUnsupported,
  labelStyleLabel,
  labelStyleGeneral, labelStyleFormal, labelStyleCasual,
  labelStyleBusiness, labelStyleTechnical, labelStyleNatural,
  labelPhoneticOff, labelPhoneticStandard, labelPhoneticTranscription,
  labelPhoneticSection, labelAutoSection,
  titleAutoMode, titleManualMode, labelAutoMode,
}: TranslateToolbarProps) {
  const styleId = useId()
  const reasoningId = useId()
  const phoneticId = useId()
  const [modelPickerView, setModelPickerView] = useState<ModelPickerInlineView | null>(null)
  const selectedProvider = useAppStore((state) => state.selectedProvider)
  const selectedModel = useAppStore((state) => state.selectedModels[state.selectedProvider])
  const supportedReasoningEfforts = getTranslationReasoningEfforts(selectedProvider, selectedModel)
  const reasoningConfigurable = supportedReasoningEfforts.length > 1
  const effectiveReasoningEffort = getEffectiveTranslationReasoningEffort(
    selectedProvider,
    selectedModel,
    reasoningEffort,
  )
  const modelPickerOpen = modelPickerView !== null
  const showSecondaryControls = !inlineModelSelector || !modelPickerOpen
  const handleModelPickerViewChange = (view: ModelPickerInlineView | null) => {
    setModelPickerView(view)
    onModelPickerViewChange?.(view)
  }

  const reasoningOptions = reasoningConfigurable
    ? [
        { value: 'auto', label: labelReasoningAuto },
        { value: 'low', label: labelReasoningLow },
        { value: 'medium', label: labelReasoningMedium },
        { value: 'high', label: labelReasoningHigh },
      ]
    : [{ value: 'auto', label: labelReasoningUnsupported }]

  return (
    <div className={`translate-settings-grid${modelPickerOpen ? ' translate-settings-grid-model-open' : ''}`}>
      {!hideModelSelector && (
        <div className={`translate-setting-control translate-setting-control-model${modelPickerOpen ? ' translate-setting-control-model-open' : ''}`}>
          {!modelPickerOpen && <span className="translate-setting-label">{labelModel}</span>}
          <ModelSelector
            inline={inlineModelSelector}
            directModelList={inlineModelSelector}
            hideTriggerWhenOpen={inlineModelSelector}
            closeRequest={modelPickerCloseRequest}
            onInlineViewChange={handleModelPickerViewChange}
          />
        </div>
      )}

      {showSecondaryControls && (
        <SelectField
          id={styleId}
          label={labelStyleLabel}
          value={translationStyle}
          options={[
            { value: 'general', label: labelStyleGeneral },
            { value: 'formal', label: labelStyleFormal },
            { value: 'casual', label: labelStyleCasual },
            { value: 'business', label: labelStyleBusiness },
            { value: 'technical', label: labelStyleTechnical },
            { value: 'natural', label: labelStyleNatural },
          ]}
          onChange={(value) => onStyleChange(value as TranslationStyle)}
          autoFocusTarget
          className="translate-setting-control"
        />
      )}

      {showSecondaryControls && (
        <SelectField
          id={phoneticId}
          label={labelPhoneticSection}
          value={phoneticMode}
          options={[
            { value: 'off', label: labelPhoneticOff },
            { value: 'standard', label: labelPhoneticStandard },
            { value: 'phonetic', label: labelPhoneticTranscription },
          ]}
          onChange={(value) => onPhoneticModeChange(value as PhoneticMode)}
          busy={isPhoneticLoading}
          className="translate-setting-control"
        />
      )}

      {showSecondaryControls && (
        <SelectField
          id={reasoningId}
          label={labelReasoning}
          value={effectiveReasoningEffort}
          options={reasoningOptions}
          onChange={(value) => onReasoningEffortChange(value as TranslationReasoningEffort)}
          disabled={!reasoningConfigurable}
          disabledHint={labelReasoningUnsupported}
          className="translate-setting-control translate-setting-control-reasoning"
        />
      )}

      {showSecondaryControls && !hideAutoToggle && (
        <div className="translate-setting-control">
          <span className="translate-setting-label">
            {labelAutoSection}
          </span>
          <AutoTranslateToggle
            autoTranslate={autoTranslate}
            onChange={onAutoTranslateChange}
            titleOn={titleAutoMode}
            titleOff={titleManualMode}
            label={labelAutoMode}
          />
        </div>
      )}
    </div>
  )
}
