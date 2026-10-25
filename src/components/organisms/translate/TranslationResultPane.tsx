import { IMAGE_TRANSLATED_SENTINEL } from '../../../hooks/useTranslate'
import { useAppStore, useT } from '../../../store/useAppStore'
import type { PhoneticMode } from '../../../types'
import { formatNumberForLocale } from '../../../utils/locale'
import { tpl } from '../../../utils/tpl'
import { MarkdownText } from '../../MarkdownText'
import { FuriganaText } from '../../translate/FuriganaText'
import { ResultPanelActions } from '../../translate/ResultPanelActions'
import { Button } from '../../ui/atoms'
import { ArrowLeftIcon, InfoCircleIcon, LayersIcon, SpinnerIcon } from '../../ui/icons'
import type { SpeakPanel } from '../../ui/SpeakButton'

interface TranslationResultPaneProps {
  headingId: string
  /** Opens the model dialog to compare this translation with up to two more models. */
  onCompare?: () => void
  translatedText: string
  phoneticText: string
  phoneticMode: PhoneticMode
  targetLang: string
  editedImageUrl: string | null
  hasImageRegions: boolean
  hasImageAttachment: boolean
  isTranslating: boolean
  /** Set while the last request failed; the toast stack shows the message itself. */
  translateError: string | null
  isResultStale: boolean
  autoTranslate: boolean
  copied: boolean
  isRewriting: 'source' | 'translated' | null
  speakingPanel: SpeakPanel | null
  speakLoading: boolean
  onSpeak: (text: string, lang: string, panel: SpeakPanel) => void
  onDownloadEdited: () => void
  onDownloadTranslated: () => void
  onRewrite: (panel: 'source' | 'translated') => void
  onUseAsSource: () => void
  onCopy: () => void
}

export function TranslationResultPane({
  headingId,
  onCompare,
  translatedText,
  phoneticText,
  phoneticMode,
  targetLang,
  editedImageUrl,
  hasImageRegions,
  hasImageAttachment,
  isTranslating,
  translateError,
  isResultStale,
  autoTranslate,
  copied,
  isRewriting,
  speakingPanel,
  speakLoading,
  onSpeak,
  onDownloadEdited,
  onDownloadTranslated,
  onRewrite,
  onUseAsSource,
  onCopy,
}: TranslationResultPaneProps) {
  const t = useT()
  const appLocale = useAppStore((state) => state.locale)
  const displayText = translatedText === IMAGE_TRANSLATED_SENTINEL ? '' : translatedText
  const hasResult = Boolean(displayText || editedImageUrl)
  const canUseResultActions = hasResult && !isTranslating && !isResultStale && !translateError

  const liveStatus = translateError
    ? ''
    : isTranslating
      ? t.translate_btn_loading
      : copied
        ? t.translate_copied
        : isResultStale
          ? (autoTranslate ? t.translate_result_stale_auto : t.translate_result_stale_manual)
          : hasResult
            ? t.translate_result_ready
            : ''

  const resultContent = editedImageUrl ? (
    <img
      src={editedImageUrl}
      alt={t.image_translate_result_label}
      className="translate-result-image"
    />
  ) : phoneticMode !== 'off' && phoneticText ? (
    phoneticMode === 'standard' ? (
      <FuriganaText text={phoneticText} className="translate-result-text" />
    ) : (
      <MarkdownText text={phoneticText} className="translate-result-text" />
    )
  ) : (
    <MarkdownText text={displayText} className="translate-result-text" />
  )

  return (
    <section
      className="translate-pane translate-result-pane"
      aria-labelledby={headingId}
      aria-busy={isTranslating}
    >
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </span>
      <header className="translate-pane-header">
        <h2 id={headingId} className="translate-pane-heading">{t.translate_result_content_label}</h2>
        {onCompare && (
          <Button size="sm" shape="rect" variant="neutral" appearance="ghost" onClick={onCompare} className="translate-compare-entry">
            <LayersIcon className="h-4 w-4" />
            <span>{t.translate_compare_models}</span>
          </Button>
        )}
      </header>
      <div className="translate-pane-body translate-result-body">
        {(isResultStale || (isTranslating && hasResult)) && (
          <div className="translate-result-state-banner">
            {isTranslating
              ? <SpinnerIcon className="translate-result-state-icon translate-result-state-spinner" />
              : <InfoCircleIcon className="translate-result-state-icon" />}
            <span>
              {isTranslating
                ? t.translate_btn_loading
                : autoTranslate
                  ? t.translate_result_stale_auto
                  : t.translate_result_stale_manual}
            </span>
          </div>
        )}

        {hasResult ? (
          // `lang` lets the browser pick target-language glyphs (JA/ZH) whatever the app locale is.
          <div lang={targetLang} className={isResultStale || isTranslating ? 'translate-result-pending' : undefined}>
            {resultContent}
          </div>
        ) : isTranslating ? (
          <div className="translate-loading-state">
            <SpinnerIcon className="translate-loading-icon" />
            <span>{t.translate_btn_loading}</span>
            <div className="translate-loading-lines" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>
        ) : (
          <div className="translate-empty-state">
            <p>{autoTranslate ? t.translate_empty_auto_hint : t.translate_empty_manual_hint}</p>
          </div>
        )}
      </div>

      <footer className={`translate-pane-footer translate-result-footer${canUseResultActions ? ' translate-result-footer-active' : ''}`}>
        {canUseResultActions && (
          <>
          {/* Same `md` size as the copy/rewrite/speak siblings in this footer. */}
          {!hasImageAttachment && <Button size="md" shape="icon" variant="neutral" appearance="ghost"
            aria-label={t.translate_use_as_source} title={t.translate_use_as_source} onClick={onUseAsSource}><ArrowLeftIcon /></Button>}
          <ResultPanelActions
            translatedText={displayText}
            targetLang={targetLang}
            editedImageUrl={editedImageUrl}
            hasImageRegions={hasImageRegions}
            hasImageAttachment={hasImageAttachment}
            copied={copied}
            isRewriting={isRewriting}
            speakingPanel={speakingPanel}
            speakLoading={speakLoading}
            onSpeak={onSpeak}
            onDownloadEdited={onDownloadEdited}
            onDownloadTranslated={onDownloadTranslated}
            onRewrite={onRewrite}
            onCopy={onCopy}
            charCountLabel={tpl(t.translate_char_count, { count: formatNumberForLocale(displayText.length, appLocale) })}
            labelSpeak={t.translate_speak}
            labelSpeakStop={t.translate_speak_stop}
            labelDownload={t.image_translate_download}
            labelRewrite={t.translate_rewrite}
            labelRewriting={t.translate_rewriting}
            labelCopy={t.translate_copy}
            labelCopied={t.translate_copied}
          />
          </>
        )}
      </footer>
    </section>
  )
}
