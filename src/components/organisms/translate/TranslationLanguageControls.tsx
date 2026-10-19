import { useT } from '../../../store/useAppStore'
import { LanguageSelector } from '../../LanguageSelector'
import { ArrowRightIcon } from '../../ui/icons'
import { TranslationSwapControl } from './TranslationSwapControl'

interface TranslationLanguageControlsProps {
  sourceHeadingId: string
  resultHeadingId: string
  sourceLang: string
  targetLang: string
  detectedSourceLang: string | null
  isDetectingLang: boolean
  disabled?: boolean
  /** When false, the swap gutter shows a static direction arrow instead. */
  showSwap?: boolean
  canSwap: boolean
  swapDisabledReason: string
  onSourceLangChange: (language: string) => void
  onTargetLangChange: (language: string) => void
  onSwap: () => void
  swapSize?: 'xs' | 'md'
}

/** Language selection row with a dedicated, non-overlapping swap column. */
export function TranslationLanguageControls({
  sourceHeadingId,
  resultHeadingId,
  sourceLang,
  targetLang,
  detectedSourceLang,
  isDetectingLang,
  disabled = false,
  showSwap = true,
  canSwap,
  swapDisabledReason,
  onSourceLangChange,
  onTargetLangChange,
  onSwap,
  swapSize = 'md',
}: TranslationLanguageControlsProps) {
  const t = useT()
  const detectedLanguageName = detectedSourceLang
    ? (t.lang_names[detectedSourceLang] ?? detectedSourceLang)
    : null

  return (
    <>
      <div className="translate-language-control translate-source-language-control">
        <h2 id={sourceHeadingId} className="translate-pane-heading">
          {t.translate_source_content_label}
        </h2>
        <LanguageSelector
          disabled={disabled}
          value={sourceLang}
          onChange={onSourceLangChange}
          includeAuto
          label={t.translate_from_label}
          labelVisuallyHidden
          status={sourceLang === 'auto'
            ? (isDetectingLang
                ? t.translate_detecting_language
                : detectedLanguageName ?? undefined)
            : undefined}
          statusBusy={isDetectingLang}
          className="translate-language-picker"
        />
      </div>

      {showSwap ? (
        <TranslationSwapControl
          canSwap={canSwap}
          disabledReason={swapDisabledReason}
          onSwap={onSwap}
          size={swapSize}
        />
      ) : (
        <span className="translate-swap-control translate-direction-indicator" aria-hidden="true">
          <ArrowRightIcon />
        </span>
      )}

      <div className="translate-language-control translate-result-language-control">
        <h2 id={resultHeadingId} className="translate-pane-heading">
          {t.translate_result_content_label}
        </h2>
        <LanguageSelector
          disabled={disabled}
          value={targetLang}
          onChange={onTargetLangChange}
          label={t.translate_to_label}
          labelVisuallyHidden
          className="translate-language-picker"
        />
      </div>
    </>
  )
}
