import { type ClipboardEventHandler, type DragEventHandler, type RefObject, useId } from 'react'
import { ACCEPTED_IMAGE_MIME_TYPES } from '../../../constants/image'
import { TRANSLATE_INPUT_WARNING_CHARS } from '../../../constants/providers'
import { useAppStore, useT } from '../../../store/useAppStore'
import type { AudioTranscriptionErrorCode } from '../../../types'
import { formatShortcutLabel } from '../../../utils/keyboardShortcuts'
import { formatNumberForLocale } from '../../../utils/locale'
import { tpl } from '../../../utils/tpl'
import { ImageAttachmentPreview } from '../../translate/ImageAttachmentPreview'
import type { ImageAttachment } from '../../translate/ImageTranslator'
import { SourcePanelActions } from '../../translate/SourcePanelActions'
import { Button } from '../../ui/atoms'
import { DragOverlay } from '../../ui/DragOverlay'
import { ChevronRightIcon, ImageIcon, InfoCircleIcon } from '../../ui/icons'
import { EmptyPanelState } from '../../ui/molecules'
import type { SpeakPanel } from '../../ui/SpeakButton'
import { TranslateButton } from '../../ui/TranslateButton'
import type { VoiceRecordingState } from '../../VoiceRecorder'

interface TranslationSourcePaneProps {
  headingId: string
  sourceText: string
  sourceLang: string
  voiceContextKey: string
  charCount: number
  translationModelCount: number
  /** Comparison mode: the pane can fold into a one-line strip once results exist. */
  collapsible?: boolean
  collapsed?: boolean
  canCollapse?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  autoTranslate: boolean
  isTranslating: boolean
  isDraggingOver: boolean
  isVoiceActive: boolean
  isVoiceInterim: boolean
  isRewriting: 'source' | 'translated' | null
  imageAttachment: ImageAttachment | null
  /** Chosen in the page header: what the pane asks for when it is empty. */
  inputMode?: 'text' | 'image' | 'voice'
  /** The active output options, e.g. "Style: Formal", shown at the footer end. */
  optionsSummary?: string
  speakingPanel: SpeakPanel | null
  speakLoading: boolean
  fileInputRef: RefObject<HTMLInputElement>
  onSourceChange: (value: string) => void
  onTranslate: () => void
  onVoiceTranscript: (text: string, isFinal: boolean) => void
  onVoiceRecordingChange: (isRecording: boolean) => void
  onVoiceStateChange: (state: VoiceRecordingState) => void
  onVoiceCancel: () => void
  onVoiceError: (code: AudioTranscriptionErrorCode) => void
  onSpeak: (text: string, lang: string, panel: SpeakPanel) => void
  onRewrite: (panel: 'source' | 'translated') => void
  onClear: () => void
  onRemoveImage: () => void
  onFileInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onPaste: ClipboardEventHandler<HTMLElement>
  onDragOver: DragEventHandler<HTMLElement>
  onDragLeave: DragEventHandler<HTMLElement>
  onDrop: DragEventHandler<HTMLElement>
}

export function TranslationSourcePane({
  headingId,
  sourceText,
  sourceLang,
  voiceContextKey,
  charCount,
  translationModelCount,
  collapsible = false,
  collapsed = false,
  canCollapse = false,
  onCollapsedChange,
  autoTranslate,
  isTranslating,
  isDraggingOver,
  isVoiceActive,
  isVoiceInterim,
  isRewriting,
  imageAttachment,
  inputMode = 'text',
  optionsSummary,
  speakingPanel,
  speakLoading,
  fileInputRef,
  onSourceChange,
  onTranslate,
  onVoiceTranscript,
  onVoiceRecordingChange,
  onVoiceStateChange,
  onVoiceCancel,
  onVoiceError,
  onSpeak,
  onRewrite,
  onClear,
  onRemoveImage,
  onFileInputChange,
  onPaste,
  onDragOver,
  onDragLeave,
  onDrop,
}: TranslationSourcePaneProps) {
  const t = useT()
  const appLocale = useAppStore((state) => state.locale)
  const inputId = useId()
  const helperId = useId()
  const counterId = useId()
  const hasSource = Boolean(sourceText.trim() || imageAttachment)
  const isLongInput = charCount > TRANSLATE_INPUT_WARNING_CHARS
  const longInputNotice = t.translate_long_text_notice(TRANSLATE_INPUT_WARNING_CHARS)
  const isComparisonMode = translationModelCount > 1

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (!hasSource || isTranslating) return
    onTranslate()
  }

  if (collapsible && collapsed) {
    // Once translations exist the source is reference material: one disclosure
    // row holding the text, the count, and the way back to editing.
    return (
      <section
        className="translate-pane translate-source-pane translate-source-pane-collapsed"
        aria-labelledby={headingId}
      >
        <h2 id={headingId} className="sr-only">{t.translate_source_content_label}</h2>
        <Button
          size="md"
          shape="rect"
          variant="neutral"
          appearance="ghost"
          aria-expanded={false}
          aria-label={t.translate_compare_source_expand}
          title={t.translate_compare_source_expand}
          onClick={() => onCollapsedChange?.(false)}
          className="translate-source-disclosure translate-source-collapsed-preview"
        >
          <ChevronRightIcon className="translate-source-disclosure-chevron" />
          <span className="translate-source-collapsed-text">{sourceText}</span>
        </Button>
        <span className="translate-char-count">
          {formatNumberForLocale(charCount, appLocale)} {t.translate_chars}
        </span>
        {!autoTranslate && (
          <TranslateButton
            isTranslating={isTranslating}
            disabled={!hasSource}
            onClick={onTranslate}
            labelTranslate={t.translate_compare_submit(translationModelCount)}
            labelLoading={t.translate_compare_submitting(translationModelCount)}
          />
        )}
      </section>
    )
  }

  return (
    <section
      className={`translate-pane translate-source-pane${isDraggingOver ? ' translate-pane-drop-active' : ''}`}
      aria-labelledby={headingId}
      onPaste={onPaste}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="translate-pane-header">
        {collapsible && canCollapse ? (
          // The heading doubles as a disclosure: its name stays "Source content",
          // aria-expanded carries the state, and the chevron sits where it will
          // also sit on the collapsed strip.
          <h2 id={headingId} className="translate-pane-heading">
            <Button
              size="md"
              shape="rect"
              variant="neutral"
              appearance="ghost"
              aria-expanded
              title={t.translate_compare_source_collapse}
              onClick={() => onCollapsedChange?.(true)}
              className="translate-source-disclosure translate-source-heading-toggle"
            >
              <ChevronRightIcon className="translate-source-disclosure-chevron translate-source-disclosure-chevron-open" />
              {t.translate_source_content_label}
            </Button>
          </h2>
        ) : (
          <h2 id={headingId} className="translate-pane-heading">{t.translate_source_content_label}</h2>
        )}
      </header>
      <div
        className="translate-pane-body translate-source-body"
      >
        {isDraggingOver && (
          <DragOverlay label={t.image_translate_upload_hint.split('\n')[0]} zIndex="z-30" />
        )}

        {imageAttachment ? (
          <div className="translate-image-source">
            <ImageAttachmentPreview imageAttachment={imageAttachment} onRemove={onRemoveImage} />
            <p className="translate-image-name" title={imageAttachment.fileName}>
              {imageAttachment.fileName}
            </p>
            <Button size="sm" shape="rect" variant="neutral" appearance="outline" onClick={() => fileInputRef.current?.click()}>
              {t.translate_image_change}
            </Button>
          </div>
        ) : inputMode === 'image' ? (
          <EmptyPanelState
            icon={<ImageIcon className="h-5 w-5" />}
            title={t.translate_image_drop_title}
            description={tpl(t.translate_image_drop_hint, { shortcut: formatShortcutLabel('CommandOrControl+V', window.api?.platform) })}
          >
            <Button size="md" shape="rect" variant="primary" appearance="soft" onClick={() => fileInputRef.current?.click()}>
              {t.translate_image_choose}
            </Button>
          </EmptyPanelState>
        ) : (
          <>
            <label className="sr-only" htmlFor={inputId}>{t.translate_source_content_label}</label>
            <textarea
              id={inputId}
              value={sourceText}
              onChange={(event) => onSourceChange(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={inputMode === 'voice' ? t.translate_voice_hint : t.translate_placeholder}
              spellCheck={false}
              aria-busy={isVoiceActive}
              aria-describedby={isVoiceActive ? helperId : `${helperId} ${counterId}`}
              className={`translate-source-input${isVoiceInterim ? ' translate-source-input-interim' : ''}`}
            />
            <p
              id={helperId}
              className="sr-only"
            >
              {t.translate_input_help}
            </p>
          </>
        )}
      </div>

      <footer className="translate-pane-footer translate-source-footer">
        <SourcePanelActions
          isVoiceActive={isVoiceActive}
          isVoiceInterim={isVoiceInterim}
          isRewriting={isRewriting}
          sourceText={sourceText}
          sourceLang={sourceLang}
          voiceContextKey={voiceContextKey}
          hasImage={Boolean(imageAttachment)}
          inputMode={inputMode}
          speakingPanel={speakingPanel}
          speakLoading={speakLoading}
          onVoiceTranscript={onVoiceTranscript}
          onVoiceRecordingChange={onVoiceRecordingChange}
          onVoiceStateChange={onVoiceStateChange}
          onVoiceCancel={onVoiceCancel}
          onVoiceError={onVoiceError}
          onImageButtonClick={() => fileInputRef.current?.click()}
          onSpeak={onSpeak}
          onRewrite={onRewrite}
          onClear={onClear}
          labelVoiceRecord={t.voice_record}
          labelVoiceStop={t.voice_stop}
          labelVoiceCancel={t.voice_cancel}
          labelVoiceTranscribing={t.voice_transcribing}
          labelVoiceRecording={t.voice_recording}
          labelAddImage={t.translate_add_image}
          labelSpeak={t.translate_speak}
          labelSpeakStop={t.translate_speak_stop}
          labelRewrite={t.translate_rewrite}
          labelRewriting={t.translate_rewriting}
          labelClear={t.translate_clear}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_IMAGE_MIME_TYPES}
          className="hidden"
          onChange={onFileInputChange}
        />

        <div className="translate-source-submit">
          {!imageAttachment && !isVoiceActive && (
            <span
              id={counterId}
              className={`translate-char-count${isLongInput ? ' translate-char-count-notice' : ''}`}
              title={isLongInput ? longInputNotice : undefined}
            >
              {isLongInput && <InfoCircleIcon />}
              <span>{formatNumberForLocale(charCount, appLocale)} {t.translate_chars}</span>
              {isLongInput && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="translate-long-text-label" aria-hidden="true">
                    {t.translate_long_text_label}
                  </span>
                  <span className="sr-only">. {longInputNotice}</span>
                </>
              )}
            </span>
          )}

          {optionsSummary && <span className="translate-options-summary">{optionsSummary}</span>}
          {!autoTranslate && (
            <>
              <span className="translate-shortcut-hint">{t.translate_manual_shortcut}</span>
              <TranslateButton
                isTranslating={isTranslating}
                disabled={!hasSource}
                onClick={onTranslate}
                labelTranslate={isComparisonMode
                  ? t.translate_compare_submit(translationModelCount)
                  : t.translate_btn}
                labelLoading={isComparisonMode
                  ? t.translate_compare_submitting(translationModelCount)
                  : t.translate_btn_loading}
              />
            </>
          )}
        </div>
      </footer>
    </section>
  )
}
