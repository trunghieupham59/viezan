import { useCallback, useEffect, useRef, useState } from 'react'
import {
  LanguagePairBar,
  TranslationComparisonPane,
  TranslationHistoryPanel,
  TranslationOptions,
  TranslationResultPane,
  TranslationSourcePane,
} from '../components/organisms'
import { PageHeader, TranslateWorkbenchTemplate } from '../components/templates'
import { Button } from '../components/ui/atoms'
import { ButtonGroup } from '../components/ui/ButtonGroup'
import { ClockIcon } from '../components/ui/icons'
import { DialogShell } from '../components/ui/molecules'
import { TRANSLATE_HISTORY_INLINE_MIN_WIDTH } from '../constants/ui'
import { useElementInlineSize } from '../hooks/useElementInlineSize'
import { IMAGE_TRANSLATED_SENTINEL, useTranslate } from '../hooks/useTranslate'
import type { VoiceErrorTranslationKey } from '../i18n/types'
import { useAppStore, useT } from '../store/useAppStore'
import { useNotificationStore } from '../store/useNotificationStore'
import type { AudioTranscriptionErrorCode, TranslationComparisonResult } from '../types'
import { formatModelName, getProviderDisplayName } from '../utils/modelDisplay'
import { tpl } from '../utils/tpl'
import { canResolveVoiceErrorInSettings, getVoiceNotificationTone } from '../utils/voiceErrors'
import '../styles/translate.css'

const TRANSLATE_PAGE_TITLE_ID = 'translate-page-title'

type TranslateInputMode = 'text' | 'image' | 'voice'
const TRANSLATE_SOURCE_HEADING_ID = 'translate-source-heading'
const TRANSLATE_RESULT_HEADING_ID = 'translate-result-heading'
/** Toast owner keys: a newer notice of the same kind replaces the previous one. */
const VOICE_ERROR_KEY = 'translate-voice-error'
const TRANSLATE_ERROR_KEY = 'translate-error'
const IMAGE_MODEL_SWITCHED_KEY = 'translate-image-model-switched'

export function TranslatePage() {
  const t = useT()
  const {
    openSettings,
    history,
    translateHistoryCollapsed,
    setTranslateHistoryCollapsed,
    deleteHistoryItem,
    clearHistory,
    reuseTranslationHistory,
  } = useAppStore()
  const [voiceErrorCode, setVoiceErrorCode] = useState<AudioTranscriptionErrorCode | null>(null)
  const [modelsOpen, setModelsOpen] = useState(false)
  const [inputMode, setInputMode] = useState<TranslateInputMode>('text')
  const {
    sourceText,
    translatedText,
    phoneticText,
    sourceLang,
    targetLang,
    isTranslating,
    translateError,
    autoTranslate,
    phoneticMode,
    translationStyle,
    translationReasoningEffort,
    selectedProvider,
    translationModels,
    setTranslationModels,
    setPhoneticMode,
    setTranslationStyle,
    setTranslationReasoningEffort,
    setAutoTranslate,
    copied,
    isRewriting,
    imageSwitchNotice,
    detectedSourceLang,
    isDetectingLang,
    imageAttachment,
    imageRegions,
    editedImageUrl,
    isDraggingOver,
    setImageSwitchNotice,
    charCount,
    isApiKeyError,
    isResultStale,
    isComparisonMode,
    comparisonResults,
    comparisonSourceText,
    copiedComparisonKey,
    selectedComparisonKey,
    activeHistoryId,
    speakingPanel,
    speakLoading,
    handleSpeak,
    isVoiceActive,
    isVoiceInterim,
    handleVoiceRecordingChange,
    handleVoiceStateChange,
    handleVoiceTranscript,
    cancelVoiceInput,
    fileInputRef,
    handleTranslate,
    handleRewrite,
    handleUseAsSource,
    handleLanguagePairChange,
    handleCopy,
    handleCopyComparison,
    handleRetryComparison,
    handleSelectComparison,
    handleDismissError,
    handleDownloadTranslatedImage,
    handleDownloadEditedImage,
    handleSourceChange,
    handleClearSource,
    handleRemoveImage,
    handleFileInputChange,
    handleSourcePanelPaste,
    handleSourcePanelDragOver,
    handleSourcePanelDragLeave,
    handleSourcePanelDrop,
  } = useTranslate()

  // In comparison mode the source folds away once results exist; the user can
  // reopen it, and the next run folds it again.
  const [sourceCollapsedOverride, setSourceCollapsedOverride] = useState<boolean | null>(null)
  const hasComparisonResult = isComparisonMode
    && comparisonResults.some((result) => result.status === 'success')
  const sourceCollapsed = isComparisonMode && (sourceCollapsedOverride ?? hasComparisonResult)
  useEffect(() => {
    if (!hasComparisonResult) setSourceCollapsedOverride(null)
  }, [hasComparisonResult])
  const handleTranslateRequest = useCallback(() => {
    setSourceCollapsedOverride(null)
    handleTranslate()
  }, [handleTranslate])

  // ── Saved translations ──
  // Beside the workbench while the container has room (the stored preference
  // decides whether it shows); a temporary overlay below that width, so the
  // preference is never overwritten by a narrow window.
  const pageRef = useRef<HTMLDivElement>(null)
  const pageWidth = useElementInlineSize(pageRef)
  const historyIsOverlay = pageWidth !== null && pageWidth < TRANSLATE_HISTORY_INLINE_MIN_WIDTH
  const [historyOverlayOpen, setHistoryOverlayOpen] = useState(false)
  useEffect(() => {
    if (!historyIsOverlay) setHistoryOverlayOpen(false)
  }, [historyIsOverlay])
  const historyOpen = historyIsOverlay ? historyOverlayOpen : !translateHistoryCollapsed
  const handleHistoryToggle = useCallback(() => {
    if (historyIsOverlay) setHistoryOverlayOpen((open) => !open)
    else setTranslateHistoryCollapsed(!translateHistoryCollapsed)
  }, [historyIsOverlay, setTranslateHistoryCollapsed, translateHistoryCollapsed])
  const closeHistoryOverlay = useCallback(() => setHistoryOverlayOpen(false), [])
  const handleHistoryReuse = useCallback((item: Parameters<typeof reuseTranslationHistory>[0]) => {
    setSourceCollapsedOverride(null)
    reuseTranslationHistory(item)
    setHistoryOverlayOpen(false)
  }, [reuseTranslationHistory])

  const voiceContextKey = `translate:${sourceLang}:${sourceText}`
  const voiceErrorMessage = voiceErrorCode
    ? t[`voice_error_${voiceErrorCode.toLowerCase()}` as VoiceErrorTranslationKey]
    : null
  const canOpenSettingsForVoiceError = voiceErrorCode
    ? canResolveVoiceErrorInSettings(voiceErrorCode)
    : false
  const activeTranslationModel = translationModels[0]
  const translateErrorContext = activeTranslationModel
    ? t.translate_error_context(
        getProviderDisplayName(activeTranslationModel.provider),
        formatModelName(activeTranslationModel.provider, activeTranslationModel.model),
      )
    : ''

  const handleVoiceError = useCallback((code: AudioTranscriptionErrorCode) => {
    setVoiceErrorCode(code === 'CANCELLED' ? null : code)
  }, [])

  // ── Notices go to the app-level toast stack ──
  // Each effect dismisses its own toast on cleanup so page-scoped notices
  // leave with the page instead of following the user to other features.
  const notify = useNotificationStore((state) => state.notify)
  const dismissNotification = useNotificationStore((state) => state.dismiss)

  useEffect(() => {
    if (!voiceErrorCode || !voiceErrorMessage) {
      dismissNotification(VOICE_ERROR_KEY)
      return
    }
    notify({
      key: VOICE_ERROR_KEY,
      tone: getVoiceNotificationTone(voiceErrorCode),
      title: t.voice_transcription_error_title,
      message: voiceErrorMessage,
      actions: canOpenSettingsForVoiceError
        ? [{ label: t.translate_error_open_settings, onClick: () => { setVoiceErrorCode(null); openSettings() } }]
        : undefined,
      onDismiss: () => setVoiceErrorCode(null),
    })
    return () => dismissNotification(VOICE_ERROR_KEY)
  }, [voiceErrorCode, voiceErrorMessage, canOpenSettingsForVoiceError, notify, dismissNotification, openSettings, t])

  // Recovery actions read the latest handlers through a ref so the toast stays
  // correct while it outlives the render that created it.
  const canRetry = Boolean(sourceText.trim() || imageAttachment)
  const recoveryRef = useRef({ handleTranslate, handleDismissError, canRetry })
  recoveryRef.current = { handleTranslate, handleDismissError, canRetry }
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-notify only when the error itself changes
  useEffect(() => {
    if (!translateError) {
      dismissNotification(TRANSLATE_ERROR_KEY)
      return
    }
    notify({
      key: TRANSLATE_ERROR_KEY,
      tone: 'error',
      message: translateError,
      detail: translateErrorContext,
      actions: [
        { label: t.translate_error_retry, onClick: () => recoveryRef.current.handleTranslate(), disabled: !recoveryRef.current.canRetry },
        { label: t.translate_error_choose_model, onClick: () => setModelsOpen(true) },
        ...(isApiKeyError ? [{ label: t.translate_error_open_settings, onClick: openSettings }] : []),
      ],
      onDismiss: () => recoveryRef.current.handleDismissError(),
    })
    return () => dismissNotification(TRANSLATE_ERROR_KEY)
  }, [translateError, isApiKeyError])

  useEffect(() => {
    if (!imageSwitchNotice) {
      dismissNotification(IMAGE_MODEL_SWITCHED_KEY)
      return
    }
    const provider = imageSwitchNotice.provider !== selectedProvider ? ` (${imageSwitchNotice.provider})` : ''
    notify({
      key: IMAGE_MODEL_SWITCHED_KEY,
      tone: 'warning',
      title: t.image_model_switched_title,
      message: `${tpl(t.image_model_switched_using, { model: imageSwitchNotice.model })}${provider}. ${t.image_model_switched_body}`,
      onDismiss: () => setImageSwitchNotice(null),
    })
    return () => dismissNotification(IMAGE_MODEL_SWITCHED_KEY)
  }, [imageSwitchNotice, selectedProvider, notify, dismissNotification, setImageSwitchNotice, t])

  const speakingComparisonKey = speakingPanel?.startsWith('comparison:')
    ? speakingPanel.slice('comparison:'.length)
    : null
  const handleSpeakComparison = useCallback((result: TranslationComparisonResult) => {
    void handleSpeak(result.translatedText, targetLang, `comparison:${result.key}`)
  }, [handleSpeak, targetLang])

  const handleVoiceLifecycleChange = useCallback((state: Parameters<typeof handleVoiceStateChange>[0]) => {
    if (state === 'requesting') setVoiceErrorCode(null)
    handleVoiceStateChange(state)
  }, [handleVoiceStateChange])

  const handleVoiceTranscriptResult = useCallback((text: string, isFinal: boolean) => {
    setVoiceErrorCode(null)
    handleVoiceTranscript(text, isFinal)
  }, [handleVoiceTranscript])

  const handleSourceTextChange = useCallback((value: string) => {
    setVoiceErrorCode(null)
    handleSourceChange(value)
  }, [handleSourceChange])

  const styleLabels: Record<typeof translationStyle, string> = {
    general: t.translate_style_general,
    formal: t.translate_style_formal,
    casual: t.translate_style_casual,
    business: t.translate_style_business,
    technical: t.translate_style_technical,
    natural: t.translate_style_natural,
  }
  const styleLabel = styleLabels[translationStyle]

  // What the source pane offers. An attached image always means image input,
  // however it arrived (paste, drop, the add-image button).
  const effectiveInputMode: TranslateInputMode = imageAttachment ? 'image' : inputMode
  const handleInputModeChange = useCallback((mode: TranslateInputMode) => {
    setInputMode(mode)
    if (mode !== 'image' && imageAttachment) handleRemoveImage()
  }, [handleRemoveImage, imageAttachment])

  const header = (
    <PageHeader
      title={t.nav_translate}
      titleId={TRANSLATE_PAGE_TITLE_ID}
      className="translate-page-header"
      leading={(
        <div className="translate-header-leading">
          <LanguagePairBar
            scope="translate"
            detectedSourceLang={isResultStale ? null : detectedSourceLang}
            isDetectingLang={isDetectingLang}
            onPairChange={handleLanguagePairChange}
          />
          <ButtonGroup<TranslateInputMode>
            size="sm"
            label={t.translate_input_mode_label}
            value={effectiveInputMode}
            onChange={handleInputModeChange}
            containerClassName="translate-input-mode"
            options={[
              { value: 'text', label: t.translate_input_mode_text },
              { value: 'image', label: t.translate_input_mode_image },
              { value: 'voice', label: t.translate_input_mode_voice },
            ]}
          />
        </div>
      )}
      actions={(
        <>
          <Button
            size="sm"
            shape="icon"
            variant={historyOpen ? 'primary' : 'neutral'}
            appearance={historyOpen ? 'soft' : 'ghost'}
            aria-label={historyOpen ? t.translate_history_toggle_hide : t.translate_history_toggle_show}
            title={historyOpen ? t.translate_history_toggle_hide : t.translate_history_toggle_show}
            aria-expanded={historyOpen}
            onClick={handleHistoryToggle}
          >
            <ClockIcon className="h-4 w-4" />
          </Button>
          <TranslationOptions
            translationStyle={translationStyle}
            onStyleChange={setTranslationStyle}
            reasoningEffort={translationReasoningEffort}
            onReasoningEffortChange={setTranslationReasoningEffort}
            autoTranslate={autoTranslate}
            onAutoTranslateChange={setAutoTranslate}
            phoneticMode={phoneticMode}
            onPhoneticModeChange={setPhoneticMode}
            isPhoneticLoading={
              phoneticMode !== 'off'
              && !isComparisonMode
              && !phoneticText
              && (isTranslating || Boolean(translatedText && translatedText !== IMAGE_TRANSLATED_SENTINEL))
            }
            isComparisonMode={isComparisonMode}
            translationModels={translationModels}
            onTranslationModelsChange={setTranslationModels}
            modelsOpen={modelsOpen}
            onModelsOpenChange={setModelsOpen}
            onOpenSettings={openSettings}
          />
        </>
      )}
    />
  )
  const historyPanel = (variant: 'panel' | 'overlay') => (
    <TranslationHistoryPanel
      entries={history}
      activeEntryId={activeHistoryId}
      onReuse={handleHistoryReuse}
      onDelete={deleteHistoryItem}
      onClearHistory={clearHistory}
      variant={variant}
      t={t}
    />
  )

  const sourcePanel = (
    <TranslationSourcePane
      headingId={TRANSLATE_SOURCE_HEADING_ID}
      sourceText={sourceText}
      sourceLang={sourceLang}
      voiceContextKey={voiceContextKey}
      charCount={charCount}
      translationModelCount={imageAttachment ? 1 : translationModels.length}
      collapsible={isComparisonMode}
      collapsed={sourceCollapsed}
      canCollapse={hasComparisonResult}
      onCollapsedChange={setSourceCollapsedOverride}
      autoTranslate={autoTranslate}
      isTranslating={isTranslating}
      isDraggingOver={isDraggingOver}
      isVoiceActive={isVoiceActive}
      isVoiceInterim={isVoiceInterim}
      isRewriting={isRewriting}
      imageAttachment={imageAttachment}
      inputMode={effectiveInputMode}
      optionsSummary={`${t.translate_style_label}: ${styleLabel}`}
      speakingPanel={speakingPanel}
      speakLoading={speakLoading}
      fileInputRef={fileInputRef}
      onSourceChange={handleSourceTextChange}
      onTranslate={handleTranslateRequest}
      onVoiceTranscript={handleVoiceTranscriptResult}
      onVoiceRecordingChange={handleVoiceRecordingChange}
      onVoiceStateChange={handleVoiceLifecycleChange}
      onVoiceCancel={cancelVoiceInput}
      onVoiceError={handleVoiceError}
      onSpeak={handleSpeak}
      onRewrite={handleRewrite}
      onClear={handleClearSource}
      onRemoveImage={handleRemoveImage}
      onFileInputChange={handleFileInputChange}
      onPaste={handleSourcePanelPaste}
      onDragOver={handleSourcePanelDragOver}
      onDragLeave={handleSourcePanelDragLeave}
      onDrop={handleSourcePanelDrop}
    />
  )

  const resultPanel = isComparisonMode ? (
    <TranslationComparisonPane
      headingId={TRANSLATE_RESULT_HEADING_ID}
      results={comparisonResults}
      sourceText={comparisonSourceText}
      copiedResultKey={copiedComparisonKey}
      speakingResultKey={speakingComparisonKey}
      selectedResultKey={selectedComparisonKey}
      speakLoading={speakLoading}
      isTranslating={isTranslating}
      isResultStale={isResultStale}
      canRetry={Boolean(sourceText.trim()) && !isTranslating}
      onUseAsSource={result => handleUseAsSource(result.translatedText)}
      onCopy={handleCopyComparison}
      onSpeak={handleSpeakComparison}
      onSelect={handleSelectComparison}
      onRetry={handleRetryComparison}
      onOpenSettings={openSettings}
      onChooseModel={() => setModelsOpen(true)}
    />
  ) : (
    <TranslationResultPane
      headingId={TRANSLATE_RESULT_HEADING_ID}
      onCompare={imageAttachment ? undefined : () => setModelsOpen(true)}
      translatedText={translatedText}
      phoneticText={phoneticText}
      phoneticMode={phoneticMode}
      targetLang={targetLang}
      editedImageUrl={editedImageUrl}
      hasImageRegions={Boolean(imageRegions)}
      hasImageAttachment={Boolean(imageAttachment)}
      isTranslating={isTranslating}
      translateError={translateError}
      isResultStale={isResultStale}
      autoTranslate={autoTranslate}
      copied={copied}
      isRewriting={isRewriting}
      speakingPanel={speakingPanel}
      speakLoading={speakLoading}
      onSpeak={handleSpeak}
      onDownloadEdited={handleDownloadEditedImage}
      onDownloadTranslated={handleDownloadTranslatedImage}
      onRewrite={handleRewrite}
      onUseAsSource={() => handleUseAsSource(translatedText)}
      onCopy={handleCopy}
    />
  )

  return (
    <>
      <TranslateWorkbenchTemplate
        containerRef={pageRef}
        titleId={TRANSLATE_PAGE_TITLE_ID}
        layout={isComparisonMode ? 'comparison' : 'single'}
        header={header}
        sourcePanel={sourcePanel}
        resultPanel={resultPanel}
        history={!historyIsOverlay && historyOpen ? historyPanel('panel') : undefined}
      />
      {historyIsOverlay && historyOverlayOpen && (
        <DialogShell
          size="md"
          label={t.translate_history_title}
          title={t.translate_history_title}
          subtitle={tpl(t.history_translate_count, { n: history.length })}
          closeLabel={t.translate_history_close}
          onClose={closeHistoryOverlay}
          backdropTestId="translate-history-overlay-backdrop"
        >
          <div className="translate-history-overlay">{historyPanel('overlay')}</div>
        </DialogShell>
      )}
    </>
  )
}
