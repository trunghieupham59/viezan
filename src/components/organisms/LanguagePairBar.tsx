import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { LANGUAGES, TARGET_LANGUAGES } from '../../constants/providers'
import { type LanguagePair, type LanguageScope, languagePairKey } from '../../store/slices/languagePairSlice'
import { useAppStore, useT } from '../../store/useAppStore'
import { Button } from '../ui/atoms'
import { ArrowRightIcon, AutoDetectIcon, ChevronDownIcon, LockIcon, SpinnerIcon, SwapIcon } from '../ui/icons'
import { LanguagePickerPanel, type PickerChip } from '../ui/molecules'
import '../../styles/language-pair-bar.css'

export type LanguagePairBarScope = LanguageScope | 'dictionary'
export type LanguagePairBarDensity = 'field' | 'inline' | 'compact'

export interface LanguagePairBarProps {
  /** Which feature's working pair the bar edits; Dictionary shares the AI Translate pair. */
  scope: LanguagePairBarScope
  /** `field` for command rows, `inline` inside a composite input, `compact` for narrow surfaces. */
  density?: LanguagePairBarDensity
  /** Halves share the row width equally instead of hugging their labels. */
  fill?: boolean
  /** Disables every control and shows a lock in the middle slot; defaults to the Live session lock. */
  locked?: boolean
  lockedReason?: string
  detectedSourceLang?: string | null
  isDetectingLang?: boolean
  /** Owns the change when provided; otherwise the pair is written straight to the store. */
  onPairChange?: (pair: LanguagePair) => void
  /** `target` renders only the target half, for single-language pickers. */
  single?: 'target'
  className?: string
}

/** How many recent pairs join the pinned ones in the picker chips. */
const RECENT_CHIP_LIMIT = 3

/**
 * Source ⇄ target as one connected control: two ghost halves around a fixed
 * middle slot that is either the swap, a static direction arrow, or a lock.
 * Recent and pinned pairs are chips inside the shared picker panel.
 */
export function LanguagePairBar({
  scope,
  density = 'field',
  fill = false,
  locked: lockedProp,
  lockedReason,
  detectedSourceLang = null,
  isDetectingLang = false,
  onPairChange,
  single,
  className = '',
}: LanguagePairBarProps) {
  const t = useT()
  const state = useAppStore()
  const storeScope: LanguageScope = scope === 'live' ? 'live' : 'translate'
  const pair: LanguagePair = scope === 'live'
    ? { source: state.liveSourceLang, target: state.liveTargetLang }
    : { source: state.sourceLang, target: state.targetLang }
  const locked = lockedProp ?? (scope === 'live' && state.liveLanguagesLocked)
  const reason = lockedReason ?? t.language_pairs_locked

  const sourceId = useId()
  const targetId = useId()
  const tooltipId = useId()
  const sourceRef = useRef<HTMLButtonElement>(null)
  const targetRef = useRef<HTMLButtonElement>(null)
  const [openHalf, setOpenHalf] = useState<'source' | 'target' | null>(null)

  const closeSource = useCallback((restoreFocus: boolean) => {
    setOpenHalf((current) => (current === 'source' ? null : current))
    if (restoreFocus) window.requestAnimationFrame(() => sourceRef.current?.focus())
  }, [])
  const closeTarget = useCallback((restoreFocus: boolean) => {
    setOpenHalf((current) => (current === 'target' ? null : current))
    if (restoreFocus) window.requestAnimationFrame(() => targetRef.current?.focus())
  }, [])
  useEffect(() => { if (locked) setOpenHalf(null) }, [locked])

  const name = (code: string) => t.lang_names[code] ?? code
  const compact = density === 'compact'
  const display = (code: string) => (compact ? code.toUpperCase() : name(code))

  const change = (next: LanguagePair) => {
    if (locked) return
    if (onPairChange) onPairChange(next)
    else state.setLanguagePair(storeScope, next)
    for (const code of [next.source, next.target]) if (code !== 'auto') state.recordLangUsage(code)
  }
  const selectPair = (p: LanguagePair) => change(state.languagePairDirections[storeScope][languagePairKey(p)] ?? p)

  const currentKey = languagePairKey(pair)
  const pairLabel = (p: LanguagePair) => `${name(p.source)} → ${name(p.target)}`
  const pinnedKeys = new Set(state.pinnedLanguagePairs.map(languagePairKey))
  const chips: PickerChip[] = single ? [] : [
    ...state.pinnedLanguagePairs.map((p) => ({ pair: p, pinned: true })),
    ...state.recentLanguagePairs.filter((p) => !pinnedKeys.has(languagePairKey(p))).slice(0, RECENT_CHIP_LIMIT)
      .map((p) => ({ pair: p, pinned: false })),
  ].map(({ pair: p, pinned }) => {
    const directed = state.languagePairDirections[storeScope][languagePairKey(p)] ?? p
    return { key: languagePairKey(p), label: pairLabel(directed), pinned, selected: languagePairKey(p) === currentKey }
  })
  const chipPairs = new Map<string, LanguagePair>()
  for (const p of [...state.pinnedLanguagePairs, ...state.recentLanguagePairs]) chipPairs.set(languagePairKey(p), p)
  const chipProps = chips.length > 0 ? {
    chips,
    chipsLabel: t.language_pairs_recent,
    onChipSelect: (key: string) => { const p = chipPairs.get(key); if (p) selectPair(p) },
    onChipPinChange: (key: string, pinned: boolean) => {
      const p = chipPairs.get(key)
      if (pinned && p) state.pinLanguagePair(p)
      else if (!pinned) state.unpinLanguagePair(key)
    },
    pinLabel: t.language_pairs_pin,
    unpinLabel: t.language_pairs_unpin,
  } : {}

  // Only AI Translate resolves an auto-detected source, so only there can Auto ever be swapped.
  const resolvedSource = pair.source === 'auto' ? (scope === 'translate' ? detectedSourceLang : null) : pair.source
  const showSwap = !(scope !== 'translate' && pair.source === 'auto')
  const canSwap = !locked && Boolean(resolvedSource && resolvedSource !== pair.target)
  const swapDisabledReason = resolvedSource === pair.target ? t.language_pairs_same : t.translate_swap_disabled_auto
  const swap = () => { if (canSwap && resolvedSource) change({ source: pair.target, target: resolvedSource }) }

  const sourceDetected = pair.source === 'auto' && !isDetectingLang && detectedSourceLang
  const sourceText = pair.source === 'auto'
    ? (isDetectingLang ? t.translate_detecting_language : sourceDetected ? name(sourceDetected) : display('auto'))
    : display(pair.source)
  const sourceStatus = pair.source === 'auto'
    ? (isDetectingLang ? t.translate_detecting_language : sourceDetected ? t.translate_detected_language(name(sourceDetected)) : name('auto'))
    : name(pair.source)

  const classes = ['language-pair-bar', `language-pair-bar--${density}`, fill && 'language-pair-bar--fill',
    locked && 'language-pair-bar--locked', single && 'language-pair-bar--single', className].filter(Boolean).join(' ')

  const middle = single ? null : locked ? (
    <fieldset
      className="language-pair-mid language-pair-mid--locked"
      title={reason}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the native-disabled child cannot receive focus, so this group is the keyboard entry point for its explanation.
      tabIndex={0}
      aria-disabled="true"
      aria-label={t.language_pairs_locked_short}
      aria-describedby={tooltipId}
    >
      <Button size="md" shape="icon" variant="neutral" appearance="ghost" disabled aria-label={t.language_pairs_locked_short}
        aria-describedby={tooltipId} className="language-pair-mid-button"><LockIcon /></Button>
      <span id={tooltipId} role="tooltip" className="language-pair-tooltip">{reason}</span>
    </fieldset>
  ) : !showSwap ? (
    <span className="language-pair-mid language-pair-mid--static" aria-hidden="true"><ArrowRightIcon /></span>
  ) : canSwap ? (
    <span className="language-pair-mid" title={t.translate_swap}>
      <Button size="md" shape="icon" variant="neutral" appearance="ghost" onClick={swap} aria-label={t.translate_swap}
        className="language-pair-mid-button language-pair-swap-button"><SwapIcon /></Button>
    </span>
  ) : (
    <fieldset
      className="language-pair-mid language-pair-mid--disabled"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the native-disabled child cannot receive focus, so this group is the keyboard entry point for its explanation.
      tabIndex={0}
      aria-disabled="true"
      aria-label={t.translate_swap}
      aria-describedby={tooltipId}
    >
      <Button size="md" shape="icon" variant="neutral" appearance="ghost" disabled aria-label={t.translate_swap}
        aria-describedby={tooltipId} className="language-pair-mid-button language-pair-swap-button"><SwapIcon /></Button>
      <span id={tooltipId} role="tooltip" className="language-pair-tooltip">{swapDisabledReason}</span>
    </fieldset>
  )

  return (
    <fieldset className={classes} aria-label={t.language_pairs_label}>
      {!single && (
        <Button
          ref={sourceRef}
          size="md"
          shape="rect"
          variant={openHalf === 'source' ? 'primary' : 'neutral'}
          appearance={openHalf === 'source' ? 'soft' : 'ghost'}
          disabled={locked}
          aria-haspopup="dialog"
          aria-expanded={openHalf === 'source'}
          aria-controls={openHalf === 'source' ? sourceId : undefined}
          aria-label={`${t.translate_from_label}: ${sourceStatus}`}
          title={locked ? reason : sourceStatus}
          onClick={() => setOpenHalf((current) => (current === 'source' ? null : 'source'))}
          className="language-pair-half language-pair-half--source"
        >
          {pair.source === 'auto' && (isDetectingLang
            ? <SpinnerIcon className="language-pair-half-icon language-pair-half-spinner" />
            : <AutoDetectIcon className="language-pair-half-icon" />)}
          <span className="language-pair-half-label">{sourceText}</span>
          {sourceDetected && !compact && <span className="language-pair-tag">{t.translate_auto_indicator}</span>}
          <ChevronDownIcon className={`language-pair-chevron${openHalf === 'source' ? ' language-pair-chevron--open' : ''}`} />
        </Button>
      )}
      {middle}
      <Button
        ref={targetRef}
        size="md"
        shape="rect"
        variant={openHalf === 'target' ? 'primary' : 'neutral'}
        appearance={openHalf === 'target' ? 'soft' : 'ghost'}
        disabled={locked}
        aria-haspopup="dialog"
        aria-expanded={openHalf === 'target'}
        aria-controls={openHalf === 'target' ? targetId : undefined}
        aria-label={`${t.translate_to_label}: ${name(pair.target)}`}
        title={locked ? reason : name(pair.target)}
        onClick={() => setOpenHalf((current) => (current === 'target' ? null : 'target'))}
        className="language-pair-half language-pair-half--target"
      >
        <span className="language-pair-half-label">{display(pair.target)}</span>
        <ChevronDownIcon className={`language-pair-chevron${openHalf === 'target' ? ' language-pair-chevron--open' : ''}`} />
      </Button>
      {!single && (
        <LanguagePickerPanel
          id={sourceId}
          open={openHalf === 'source' && !locked}
          anchorRef={sourceRef}
          onClose={closeSource}
          value={pair.source}
          options={LANGUAGES}
          onChange={(source) => change({ ...pair, source })}
          getLabel={(language) => name(language.code)}
          label={t.translate_from_label}
          searchPlaceholder={t.language_picker_search_placeholder}
          noResultsLabel={t.language_picker_no_results}
          {...chipProps}
        />
      )}
      <LanguagePickerPanel
        id={targetId}
        open={openHalf === 'target' && !locked}
        anchorRef={targetRef}
        onClose={closeTarget}
        value={pair.target}
        options={TARGET_LANGUAGES}
        onChange={(target) => change({ ...pair, target })}
        getLabel={(language) => name(language.code)}
        label={t.translate_to_label}
        searchPlaceholder={t.language_picker_search_placeholder}
        noResultsLabel={t.language_picker_no_results}
        {...chipProps}
      />
    </fieldset>
  )
}
