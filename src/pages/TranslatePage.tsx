import { useCallback, useEffect, useRef, useState } from 'react'
import {
  LanguagePairBar,
  TranslationComparisonPane,
  TranslationControlsHeader,
  TranslationResultPane,
  TranslationSourcePane,
} from '../components/organisms'
import { TranslateWorkbenchTemplate } from '../components/templates'
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
const TRANSLATE_SOURCE_HEADING_ID = 'translate-source-heading'
const TRANSLATE_RESULT_HEADING_ID = 'translate-result-heading'
/** Toast owner keys: a newer notice of the same kind replaces the previous one. */
const VOICE_ERROR_KEY = 'translate-voice-error'
const TRANSLATE_ERROR_KEY = 'translate-error'
const IMAGE_MODEL_SWITCHED_KEY = 'translate-image-model-switched'

export function TranslatePage() {
  const t = useT()
  const { openSettings } = useAppStore()
  const [voiceErrorCode, setVoiceErrorCode] = useState<AudioTranscriptionErrorCode | null>(null)
  const [modelsOpen, setModelsOpen] = useState(false)
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
    copiedComparisonKey,
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

  const header = (
    <TranslationControlsHeader
      titleId={TRANSLATE_PAGE_TITLE_ID}
      languageControls={(
        <LanguagePairBar
          scope="translate"
          detectedSourceLang={isResultStale ? null : detectedSourceLang}
          isDetectingLang={isDetectingLang}
          onPairChange={handleLanguagePairChange}
        />
      )}
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
  )

  const sourcePanel = (
    <TranslationSourcePane
      headingId={TRANSLATE_SOURCE_HEADING_ID}
      sourceText={sourceText}
      sourceLang={sourceLang}
      voiceContextKey={voiceContextKey}
      charCount={charCount}
      translationModelCount={imageAttachment ? 1 : translationModels.length}
      autoTranslate={autoTranslate}
      isTranslating={isTranslating}
      isDraggingOver={isDraggingOver}
      isVoiceActive={isVoiceActive}
      isVoiceInterim={isVoiceInterim}
      isRewriting={isRewriting}
      imageAttachment={imageAttachment}
      speakingPanel={speakingPanel}
      speakLoading={speakLoading}
      fileInputRef={fileInputRef}
      onSourceChange={handleSourceTextChange}
      onTranslate={handleTranslate}
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
      copiedResultKey={copiedComparisonKey}
      speakingResultKey={speakingComparisonKey}
      speakLoading={speakLoading}
      isTranslating={isTranslating}
      isResultStale={isResultStale}
      canRetry={Boolean(sourceText.trim()) && !isTranslating}
      onUseAsSource={result => handleUseAsSource(result.translatedText)}
      onCopy={handleCopyComparison}
      onSpeak={handleSpeakComparison}
      onRetry={handleRetryComparison}
      onOpenSettings={openSettings}
      onChooseModel={() => setModelsOpen(true)}
    />
  ) : (
    <TranslationResultPane
      headingId={TRANSLATE_RESULT_HEADING_ID}
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
    <TranslateWorkbenchTemplate
      titleId={TRANSLATE_PAGE_TITLE_ID}
      layout={isComparisonMode ? 'comparison' : 'single'}
      header={header}
      sourcePanel={sourcePanel}
      resultPanel={resultPanel}
    />
  )
}
