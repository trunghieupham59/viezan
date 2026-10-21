import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useT } from '../../../store/useAppStore'
import type { TranslationComparisonResult, TranslationModelSelection } from '../../../types'
import { formatModelName, getProviderDisplayName } from '../../../utils/modelDisplay'
import { type DiffSegment, highlightTranslationDifferences } from '../../../utils/translationDiff'
import { MarkdownText } from '../../MarkdownText'
import { ProviderIcon } from '../../ProviderIcon'
import { Button } from '../../ui/atoms'
import {
  ArrowUpIcon,
  CheckIcon,
  CopyIcon,
  InfoCircleIcon,
  RefreshIcon,
  SpeakerIcon,
  SpinnerIcon,
  StopIcon,
  XIcon,
} from '../../ui/icons'
import { ModelRunStatus, TranslationResultTab } from '../../ui/molecules'

interface TranslationComparisonPaneProps {
  headingId: string
  results: TranslationComparisonResult[]
  copiedResultKey: string | null
  speakingResultKey: string | null
  selectedResultKey: string | null
  speakLoading: boolean
  isTranslating: boolean
  isResultStale: boolean
  canRetry: boolean
  onUseAsSource: (result: TranslationComparisonResult) => void
  onCopy: (result: TranslationComparisonResult) => void
  onSpeak: (result: TranslationComparisonResult) => void
  onSelect: (result: TranslationComparisonResult) => void
  onRetry: (selection: TranslationModelSelection) => void
  onOpenSettings: () => void
  onChooseModel: () => void
}

type ErrorRecovery = {
  message: string
  showRetry: boolean
  showChangeModel: boolean
  isApiKeyError: boolean
}

/**
 * Parallel translation results. Successful models become full-height columns the
 * reader picks from, failed models fold into a slim recovery row, and compact
 * widths fall back to tabs.
 */
export function TranslationComparisonPane({
  headingId,
  results,
  copiedResultKey,
  speakingResultKey,
  selectedResultKey,
  speakLoading,
  isTranslating,
  isResultStale,
  canRetry,
  onUseAsSource,
  onCopy,
  onSpeak,
  onSelect,
  onRetry,
  onOpenSettings,
  onChooseModel,
}: TranslationComparisonPaneProps) {
  const t = useT()
  const tabsId = useId()
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())
  const [compactResultKey, setCompactResultKey] = useState(results[0]?.key ?? null)
  const [highlightDifferences, setHighlightDifferences] = useState(true)
  const [dismissedFailureKeys, setDismissedFailureKeys] = useState<string[]>([])
  const completedCount = results.filter((result) => (
    result.status === 'success' || result.status === 'error'
  )).length
  const liveStatus = t.translate_compare_progress(completedCount, results.length)
  const hasStarted = results.some((result) => result.status !== 'idle')
  const successfulResults = results.filter((result) => result.status === 'success')
  const failedResults = results.filter((result) => (
    result.status === 'error' && !dismissedFailureKeys.includes(result.key)
  ))
  const columnCount = results.filter((result) => result.status !== 'error').length
  const canHighlight = successfulResults.length >= 2
  // Nothing to mark when every model agrees; say so instead of showing an inert toggle.
  const allIdentical = canHighlight && successfulResults.every((result) => (
    result.translatedText === successfulResults[0].translatedText
  ))
  const getStatusLabel = (status: TranslationComparisonResult['status']) => {
    if (status === 'loading') return t.translate_compare_status_running
    if (status === 'success') return t.translate_compare_status_complete
    if (status === 'error') return t.translate_compare_status_failed
    return t.translate_compare_status_ready
  }

  // Marks are recomputed only when the set of finished translations changes.
  const successTextsKey = successfulResults.map((result) => result.translatedText).join('\u0000')
  const successKeysKey = successfulResults.map((result) => result.key).join('\u0000')
  const segmentsByKey = useMemo(() => {
    const map = new Map<string, DiffSegment[]>()
    const keys = successKeysKey ? successKeysKey.split('\u0000') : []
    if (!highlightDifferences || keys.length < 2) return map
    const segments = highlightTranslationDifferences(successTextsKey.split('\u0000'))
    keys.forEach((key, index) => {
      map.set(key, segments[index])
    })
    return map
  }, [successTextsKey, successKeysKey, highlightDifferences])

  useEffect(() => {
    const availableKeys = new Set(results.map((result) => result.key))
    if (!compactResultKey || !availableKeys.has(compactResultKey)) {
      setCompactResultKey(results[0]?.key ?? null)
    }
  }, [compactResultKey, results])

  // A dismissed failure comes back as soon as that model runs again.
  useEffect(() => {
    setDismissedFailureKeys((current) => current.filter((key) => (
      results.some((result) => result.key === key && result.status === 'error')
    )))
  }, [results])

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
      <h2 id={headingId} className="sr-only">{t.translate_result_content_label}</h2>

      <div className="translate-comparison-toolbar">
        <span
          className="translate-comparison-progress"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {hasStarted ? liveStatus : t.translate_compare_heading(results.length)}
        </span>
        {allIdentical ? (
          <span className="translate-comparison-identical">{t.translate_compare_identical}</span>
        ) : canHighlight && (
          <Button
            size="xs"
            shape="rect"
            variant={highlightDifferences ? 'primary' : 'neutral'}
            appearance={highlightDifferences ? 'soft' : 'ghost'}
            aria-pressed={highlightDifferences}
            title={t.translate_compare_highlight_hint}
            onClick={() => setHighlightDifferences((value) => !value)}
          >
            {t.translate_compare_highlight}
          </Button>
        )}
      </div>

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

        <div className="translate-comparison-list" data-result-count={columnCount}>
          {results.map((result, index) => (
            <div
              key={result.key}
              id={`${tabsId}-panel-${index}`}
              className="translate-comparison-card-shell"
              role="tabpanel"
              aria-labelledby={`${tabsId}-tab-${index}`}
              data-compact-active={compactResultKey === result.key}
              data-status={result.status}
              data-selected={selectedResultKey === result.key}
            >
              <ComparisonResultCard
                result={result}
                segments={segmentsByKey.get(result.key) ?? null}
                isCopied={copiedResultKey === result.key}
                isSpeaking={speakingResultKey === result.key}
                isSelected={selectedResultKey === result.key}
                speakLoading={speakLoading}
                canRetry={canRetry && result.status !== 'loading'}
                canUseAsSource={!isTranslating && !isResultStale}
                canSelect={!isTranslating && !isResultStale}
                onUseAsSource={onUseAsSource}
                onCopy={onCopy}
                onSpeak={onSpeak}
                onSelect={onSelect}
                onRetry={onRetry}
                onOpenSettings={onOpenSettings}
                onChooseModel={onChooseModel}
              />
            </div>
          ))}
        </div>

        {failedResults.length > 0 && (
          <ul className="translate-comparison-failures" aria-label={t.translate_compare_failures_label}>
            {failedResults.map((result) => (
              <ComparisonFailureRow
                key={result.key}
                result={result}
                canRetry={canRetry}
                onRetry={onRetry}
                onOpenSettings={onOpenSettings}
                onChooseModel={onChooseModel}
                onDismiss={() => setDismissedFailureKeys((current) => [...current, result.key])}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function useErrorRecovery(result: TranslationComparisonResult): ErrorRecovery {
  const t = useT()
  const modelName = formatModelName(result.provider, result.model)
  const providerName = getProviderDisplayName(result.provider)
  const isApiKeyError = result.errorCode === 'NO_API_KEY' || result.errorCode === 'INVALID_KEY'
  const isModelUnavailable = result.errorCode === 'MODEL_UNAVAILABLE'
  const isUnknownError = result.errorCode === 'UNKNOWN'
  const message = result.errorCode === 'NO_API_KEY'
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
  return {
    message,
    showRetry: !isApiKeyError && !isModelUnavailable,
    showChangeModel: isApiKeyError || isModelUnavailable || isUnknownError,
    isApiKeyError,
  }
}

interface ErrorActionsProps {
  result: TranslationComparisonResult
  recovery: ErrorRecovery
  canRetry: boolean
  size: 'xs' | 'sm'
  onRetry: (selection: TranslationModelSelection) => void
  onOpenSettings: () => void
  onChooseModel: () => void
}

function ErrorActions({ result, recovery, canRetry, size, onRetry, onOpenSettings, onChooseModel }: ErrorActionsProps) {
  const t = useT()
  return (
    <>
      {recovery.showRetry && (
        <Button size={size} shape="rect" variant="neutral" appearance="ghost" disabled={!canRetry} onClick={() => onRetry(result)}>
          <RefreshIcon />
          {t.translate_compare_retry}
        </Button>
      )}
      {recovery.showChangeModel && (
        <Button size={size} shape="rect" variant="neutral" appearance="ghost" onClick={onChooseModel}>
          {t.translate_compare_change_model}
        </Button>
      )}
      {recovery.isApiKeyError && (
        <Button size={size} shape="rect" variant="primary" appearance="soft" onClick={onOpenSettings}>
          {t.translate_error_open_settings}
        </Button>
      )}
    </>
  )
}

interface ComparisonFailureRowProps {
  result: TranslationComparisonResult
  canRetry: boolean
  onRetry: (selection: TranslationModelSelection) => void
  onOpenSettings: () => void
  onChooseModel: () => void
  onDismiss: () => void
}

/** One failed model, folded into a row so it never takes a column away from readable results. */
function ComparisonFailureRow({ result, canRetry, onRetry, onOpenSettings, onChooseModel, onDismiss }: ComparisonFailureRowProps) {
  const t = useT()
  const modelName = formatModelName(result.provider, result.model)
  const recovery = useErrorRecovery(result)
  return (
    <li className="translate-comparison-failure" role="alert">
      <span className="translate-comparison-failure-icon" aria-hidden="true">
        <ProviderIcon provider={result.provider} size={16} />
      </span>
      <span className="translate-comparison-failure-copy">
        <strong>{modelName}</strong>
        <span>{recovery.message}</span>
      </span>
      <span className="translate-comparison-failure-actions">
        <ErrorActions
          result={result}
          recovery={recovery}
          canRetry={canRetry}
          size="xs"
          onRetry={onRetry}
          onOpenSettings={onOpenSettings}
          onChooseModel={onChooseModel}
        />
        <Button
          size="xs"
          shape="icon"
          variant="neutral"
          appearance="ghost"
          aria-label={`${t.translate_compare_dismiss_failure}: ${modelName}`}
          title={t.translate_compare_dismiss_failure}
          onClick={onDismiss}
        >
          <XIcon />
        </Button>
      </span>
    </li>
  )
}

interface ComparisonResultCardProps {
  result: TranslationComparisonResult
  segments: DiffSegment[] | null
  isCopied: boolean
  isSpeaking: boolean
  isSelected: boolean
  speakLoading: boolean
  canRetry: boolean
  canUseAsSource: boolean
  canSelect: boolean
  onUseAsSource: (result: TranslationComparisonResult) => void
  onCopy: (result: TranslationComparisonResult) => void
  onSpeak: (result: TranslationComparisonResult) => void
  onSelect: (result: TranslationComparisonResult) => void
  onRetry: (selection: TranslationModelSelection) => void
  onOpenSettings: () => void
  onChooseModel: () => void
}

function ComparisonResultCard({
  result,
  segments,
  isCopied,
  isSpeaking,
  isSelected,
  speakLoading,
  canRetry,
  canUseAsSource,
  canSelect,
  onUseAsSource,
  onCopy,
  onSpeak,
  onSelect,
  onRetry,
  onOpenSettings,
  onChooseModel,
}: ComparisonResultCardProps) {
  const t = useT()
  const modelName = formatModelName(result.provider, result.model)
  const providerName = getProviderDisplayName(result.provider)
  const recovery = useErrorRecovery(result)
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
  const pickLabel = isSelected ? t.translate_compare_picked : t.translate_compare_pick

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
            <span className="translate-comparison-card-provider">{providerName}</span>
            {/* Idle has nothing to report; the body already invites the run. */}
            {result.status !== 'idle' && (
              <ModelRunStatus status={result.status} label={statusLabel} />
            )}
          </span>
        </span>
        {result.status === 'success' && (
          <Button
            size="sm"
            shape="rect"
            variant={isSelected ? 'primary' : 'neutral'}
            appearance={isSelected ? 'soft' : 'outline'}
            aria-pressed={isSelected}
            aria-label={`${pickLabel}: ${modelName} · ${providerName}`}
            disabled={!canSelect && !isSelected}
            onClick={() => onSelect(result)}
            className="translate-comparison-pick"
          >
            {isSelected && <CheckIcon />}
            {/* Narrow columns keep the model name and shorten the verb instead. */}
            <span className="translate-comparison-pick-label">{pickLabel}</span>
            <span className="translate-comparison-pick-label-short" aria-hidden="true">
              {isSelected ? t.translate_compare_picked : t.translate_compare_pick_short}
            </span>
          </Button>
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
            <p>{recovery.message}</p>
            <div className="translate-comparison-error-actions">
              <ErrorActions
                result={result}
                recovery={recovery}
                canRetry={canRetry}
                size="sm"
                onRetry={onRetry}
                onOpenSettings={onOpenSettings}
                onChooseModel={onChooseModel}
              />
            </div>
          </div>
        ) : result.status === 'success' ? (
          segments ? (
            <p className="translate-comparison-text translate-comparison-text-diff">
              {segments.map((segment, index) => (
                segment.changed
                  // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional slices of one string
                  ? <mark key={index}>{segment.text}</mark>
                  // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional slices of one string
                  : <span key={index}>{segment.text}</span>
              ))}
            </p>
          ) : (
            <MarkdownText text={result.translatedText} className="translate-comparison-text" />
          )
        ) : (
          <p className="translate-comparison-idle">{t.translate_compare_idle}</p>
        )}
      </div>

      {result.status === 'success' && (
        <footer className="translate-comparison-card-footer">
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
            variant="neutral"
            appearance="ghost"
            disabled={!canUseAsSource}
            aria-label={`${t.translate_use_as_source}: ${modelName} · ${providerName}`}
            title={t.translate_use_as_source}
            onClick={() => onUseAsSource(result)}
          >
            <ArrowUpIcon />
          </Button>
        </footer>
      )}
    </article>
  )
}
