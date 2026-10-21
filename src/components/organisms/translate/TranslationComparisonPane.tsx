import { useEffect, useId, useRef, useState } from 'react'
import { useT } from '../../../store/useAppStore'
import type { TranslationComparisonResult, TranslationModelSelection } from '../../../types'
import { formatModelName, getProviderDisplayName } from '../../../utils/modelDisplay'
import { MarkdownText } from '../../MarkdownText'
import { ProviderIcon } from '../../ProviderIcon'
import { Button } from '../../ui/atoms'
import {
  ArrowLeftIcon,
  CheckIcon,
  CopyIcon,
  InfoCircleIcon,
  RefreshIcon,
  SpeakerIcon,
  SpinnerIcon,
  StopIcon,
} from '../../ui/icons'
import { ModelRunStatus, TranslationResultTab } from '../../ui/molecules'

interface TranslationComparisonPaneProps {
  headingId: string
  results: TranslationComparisonResult[]
  copiedResultKey: string | null
  speakingResultKey: string | null
  speakLoading: boolean
  isTranslating: boolean
  isResultStale: boolean
  canRetry: boolean
  onUseAsSource: (result: TranslationComparisonResult) => void
  onCopy: (result: TranslationComparisonResult) => void
  onSpeak: (result: TranslationComparisonResult) => void
  onRetry: (selection: TranslationModelSelection) => void
  onOpenSettings: () => void
  onChooseModel: () => void
}

/** Parallel translation results with desktop comparison columns and compact tabs. */
export function TranslationComparisonPane({
  headingId,
  results,
  copiedResultKey,
  speakingResultKey,
  speakLoading,
  isTranslating,
  isResultStale,
  canRetry,
  onUseAsSource,
  onCopy,
  onSpeak,
  onRetry,
  onOpenSettings,
  onChooseModel,
}: TranslationComparisonPaneProps) {
  const t = useT()
  const tabsId = useId()
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())
  const [compactResultKey, setCompactResultKey] = useState(results[0]?.key ?? null)
  const completedCount = results.filter((result) => (
    result.status === 'success' || result.status === 'error'
  )).length
  const liveStatus = t.translate_compare_progress(completedCount, results.length)
  const hasStarted = results.some((result) => result.status !== 'idle')
  const getStatusLabel = (status: TranslationComparisonResult['status']) => {
    if (status === 'loading') return t.translate_compare_status_running
    if (status === 'success') return t.translate_compare_status_complete
    if (status === 'error') return t.translate_compare_status_failed
    return t.translate_compare_status_ready
  }

  useEffect(() => {
    const availableKeys = new Set(results.map((result) => result.key))
    if (!compactResultKey || !availableKeys.has(compactResultKey)) {
      setCompactResultKey(results[0]?.key ?? null)
    }
  }, [compactResultKey, results])

  const selectCompactTab = (key: string, focus = false) => {
    setCompactResultKey(key)
    if (focus) requestAnimationFrame(() => tabRefs.current.get(key)?.focus())
  }

  const handleTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    let nextIndex = index
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + results.length) % results.length
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % results.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = results.length - 1
    const nextResult = results[nextIndex]
    if (nextResult) selectCompactTab(nextResult.key, true)
  }

  return (
    <section
      className="translate-pane translate-result-pane translate-comparison-pane"
      aria-labelledby={headingId}
      aria-busy={isTranslating}
    >
      {/* Each result column carries its own header, so the pane heading and the
          aggregate progress are exposed to assistive tech without spending a row. */}
      <h2 id={headingId} className="sr-only">{t.translate_result_content_label}</h2>
      {hasStarted && (
        <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {liveStatus}
        </span>
      )}

      <div
        className="translate-comparison-mobile-tabs"
        role="tablist"
        aria-label={t.translate_compare_mobile_tabs}
      >
        {results.map((result, index) => {
          const modelName = formatModelName(result.provider, result.model)
          const providerName = getProviderDisplayName(result.provider)
          const statusLabel = getStatusLabel(result.status)
          const tabId = `${tabsId}-tab-${index}`
          return (
            <TranslationResultTab
              key={result.key}
              tabRef={(node) => {
                if (node) tabRefs.current.set(result.key, node)
                else tabRefs.current.delete(result.key)
              }}
              id={tabId}
              controls={`${tabsId}-panel-${index}`}
              selected={compactResultKey === result.key}
              provider={result.provider}
              modelName={modelName}
              providerName={providerName}
              status={result.status}
              statusLabel={statusLabel}
              onClick={() => selectCompactTab(result.key)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            />
          )
        })}
      </div>

      <div className="translate-pane-body translate-comparison-body">
        {isResultStale && !isTranslating && (
          <div className="translate-result-state-banner">
            <InfoCircleIcon className="translate-result-state-icon" />
            <span>{t.translate_result_stale_manual}</span>
          </div>
        )}

        <div className="translate-comparison-list" data-result-count={results.length}>
          {results.map((result, index) => (
            <div
              key={result.key}
              id={`${tabsId}-panel-${index}`}
              className="translate-comparison-card-shell"
              role="tabpanel"
              aria-labelledby={`${tabsId}-tab-${index}`}
              data-compact-active={compactResultKey === result.key}
            >
              <ComparisonResultCard
                result={result}
                isCopied={copiedResultKey === result.key}
                isSpeaking={speakingResultKey === result.key}
                speakLoading={speakLoading}
                canRetry={canRetry && result.status !== 'loading'}
                canUseAsSource={!isTranslating && !isResultStale}
                onUseAsSource={onUseAsSource}
                onCopy={onCopy}
                onSpeak={onSpeak}
                onRetry={onRetry}
                onOpenSettings={onOpenSettings}
                onChooseModel={onChooseModel}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

interface ComparisonResultCardProps {
  canUseAsSource: boolean
  result: TranslationComparisonResult
  isCopied: boolean
  isSpeaking: boolean
  speakLoading: boolean
  canRetry: boolean
  onUseAsSource: (result: TranslationComparisonResult) => void
  onCopy: (result: TranslationComparisonResult) => void
  onSpeak: (result: TranslationComparisonResult) => void
  onRetry: (selection: TranslationModelSelection) => void
  onOpenSettings: () => void
  onChooseModel: () => void
}

function ComparisonResultCard({
  canUseAsSource,
  result,
  isCopied,
  isSpeaking,
  speakLoading,
  canRetry,
  onUseAsSource,
  onCopy,
  onSpeak,
  onRetry,
  onOpenSettings,
  onChooseModel,
}: ComparisonResultCardProps) {
  const t = useT()
  const modelName = formatModelName(result.provider, result.model)
  const providerName = getProviderDisplayName(result.provider)
  const isApiKeyError = result.errorCode === 'NO_API_KEY' || result.errorCode === 'INVALID_KEY'
  const isModelUnavailable = result.errorCode === 'MODEL_UNAVAILABLE'
  const isUnknownError = result.errorCode === 'UNKNOWN'
  const showRetry = !isApiKeyError && !isModelUnavailable
  const showChangeModel = isApiKeyError || isModelUnavailable || isUnknownError
  const errorMessage = result.errorCode === 'NO_API_KEY'
    ? t.translate_compare_error_missing_key(providerName)
    : result.errorCode === 'INVALID_KEY'
      ? t.translate_compare_error_invalid_key(providerName)
      : result.errorCode === 'RATE_LIMIT'
        ? t.translate_compare_error_rate_limit(providerName)
        : result.errorCode === 'MODEL_UNAVAILABLE'
          ? t.translate_compare_error_model_unavailable(modelName, providerName)
          : result.errorCode === 'NETWORK'
            ? t.translate_compare_error_network(providerName)
            : result.errorCode === 'UNKNOWN'
              ? t.translate_compare_error_unknown(modelName)
              : result.error ?? t.translate_compare_error_unknown(modelName)
  const duration = result.durationMs === null
    ? null
    : t.translate_compare_duration((result.durationMs / 1000).toFixed(result.durationMs < 10_000 ? 1 : 0))
  // The check icon already says "complete"; the elapsed time is the useful part.
  const statusLabel = result.status === 'loading'
    ? t.translate_compare_status_running
    : result.status === 'success'
      ? duration ?? t.translate_compare_status_complete
      : result.status === 'error'
        ? t.translate_compare_status_failed
        : t.translate_compare_status_ready

  return (
    <article
      className="translate-comparison-card"
      aria-label={`${modelName} · ${providerName}`}
      aria-busy={result.status === 'loading'}
    >
      <header className="translate-comparison-card-header">
        <span className="translate-comparison-card-icon" aria-hidden="true">
          <ProviderIcon provider={result.provider} size={18} />
        </span>
        <span className="translate-comparison-card-heading">
          <strong>{modelName}</strong>
          <span className="translate-comparison-card-meta">
            <span>{providerName}</span>
            {/* Idle has nothing to report; the body already invites the run. */}
            {result.status !== 'idle' && (
              <ModelRunStatus status={result.status} label={statusLabel} />
            )}
          </span>
        </span>
        {/* Actions live in the header so long text never pushes them out of view. */}
        {result.status === 'success' && (
          <div className="translate-comparison-card-actions">
            <Button size="sm" shape="icon" variant="neutral" appearance="ghost" disabled={!canUseAsSource}
              aria-label={`${t.translate_use_as_source}: ${modelName} · ${providerName}`} title={t.translate_use_as_source}
              onClick={() => onUseAsSource(result)}><ArrowLeftIcon /></Button>
            <Button
              size="sm"
              shape="icon"
              variant={isSpeaking ? 'danger' : 'neutral'}
              appearance="ghost"
              aria-label={`${isSpeaking ? t.translate_speak_stop : t.translate_speak}: ${modelName} · ${providerName}`}
              title={isSpeaking ? t.translate_speak_stop : t.translate_speak}
              onClick={() => onSpeak(result)}
            >
              {speakLoading && isSpeaking
                ? <SpinnerIcon />
                : isSpeaking
                  ? <StopIcon />
                  : <SpeakerIcon />}
            </Button>
            <Button
              size="sm"
              shape="icon"
              variant={isCopied ? 'primary' : 'neutral'}
              appearance={isCopied ? 'soft' : 'ghost'}
              aria-label={`${isCopied ? t.translate_copied : t.translate_copy}: ${modelName} · ${providerName}`}
              title={isCopied ? t.translate_copied : t.translate_copy}
              onClick={() => onCopy(result)}
            >
              {isCopied ? <CheckIcon /> : <CopyIcon />}
            </Button>
          </div>
        )}
      </header>

      <div className="translate-comparison-card-body">
        {result.status === 'loading' ? (
          <div className="translate-comparison-skeleton" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        ) : result.status === 'error' ? (
          <div className="translate-comparison-error" role="alert">
            <p>{errorMessage}</p>
            <div className="translate-comparison-error-actions">
              {showRetry && (
                <Button
                  size="sm"
                  shape="rect"
                  variant="neutral"
                  appearance="outline"
                  disabled={!canRetry}
                  onClick={() => onRetry(result)}
                >
                  <RefreshIcon />
                  {t.translate_compare_retry}
                </Button>
              )}
              {showChangeModel && (
                <Button
                  size="sm"
                  shape="rect"
                  variant="neutral"
                  appearance="outline"
                  onClick={onChooseModel}
                >
                  {t.translate_compare_change_model}
                </Button>
              )}
              {isApiKeyError && (
                <Button size="sm" shape="rect" variant="primary" appearance="soft" onClick={onOpenSettings}>
                  {t.translate_error_open_settings}
                </Button>
              )}
            </div>
          </div>
        ) : result.status === 'success' ? (
          <MarkdownText text={result.translatedText} className="translate-comparison-text" />
        ) : (
          <p className="translate-comparison-idle">{t.translate_compare_idle}</p>
        )}
      </div>
    </article>
  )
}
