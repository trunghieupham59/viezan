import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type LanguagePair, type LanguageScope, languagePairKey } from '../../../store/slices/languagePairSlice'
import { useAppStore, useT } from '../../../store/useAppStore'
import { Button } from '../../ui/atoms'
import { ChevronDownIcon, TranslateIcon, XIcon } from '../../ui/icons'
import { TranslationLanguageControls } from './TranslationLanguageControls'
import '../../../styles/language-pairs.css'

interface LanguagePairControlsProps {
  scope: LanguageScope
  sourceHeadingId: string
  resultHeadingId: string
  detectedSourceLang?: string | null
  isDetectingLang?: boolean
  onPairChange?: (pair: LanguagePair) => void
}

/** Shared controls; preferences are shared, working languages belong to each feature. */
export function LanguagePairControls({ scope, sourceHeadingId, resultHeadingId, detectedSourceLang = null,
  isDetectingLang = false, onPairChange }: LanguagePairControlsProps) {
  const t = useT()
  const state = useAppStore()
  const pair = scope === 'live'
    ? { source: state.liveSourceLang, target: state.liveTargetLang }
    : { source: state.sourceLang, target: state.targetLang }
  const locked = scope === 'live' && state.liveLanguagesLocked
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const close = useCallback((restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])
  useEffect(() => { if (locked) setOpen(false) }, [locked])
  useLayoutEffect(() => {
    if (!open || locked) return
    const update = () => {
      const anchor = triggerRef.current?.getBoundingClientRect()
      if (!anchor) return
      const tokens = getComputedStyle(document.documentElement)
      const pixels = (name: string) => Number.parseFloat(tokens.getPropertyValue(name)) || 0
      const margin = pixels('--vzn-space-2')
      const gap = pixels('--vzn-space-1-5')
      const width = Math.min(pixels('--vzn-picker-min-inline'), window.innerWidth - margin * 2)
      const below = window.innerHeight - anchor.bottom - gap - margin
      const above = anchor.top - gap - margin
      const height = Math.min(panelRef.current?.scrollHeight ?? 0, pixels('--vzn-picker-max-block'))
      const placeBelow = below >= height || below >= above
      const maxHeight = Math.min(pixels('--vzn-picker-max-block'), Math.max(0, placeBelow ? below : above))
      setPosition({ width, maxHeight, left: Math.max(margin, Math.min(anchor.right - width, window.innerWidth - width - margin)),
        top: placeBelow ? anchor.bottom + gap : Math.max(margin, anchor.top - gap - Math.min(height, maxHeight)) })
    }
    update()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    if (panelRef.current) observer?.observe(panelRef.current)
    if (triggerRef.current) observer?.observe(triggerRef.current)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => { observer?.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true) }
  }, [open, locked])
  useEffect(() => {
    if (!open || locked) return
    const frame = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus())
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panelRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) close(false)
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
      if (event.key === 'Tab') {
        const buttons = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        if ((!event.shiftKey && index === buttons.length - 1) || (event.shiftKey && index === 0)) { event.preventDefault(); close() }
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', keydown)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keydown) }
  }, [open, locked, close])
  const key = languagePairKey(pair)
  const pinned = state.pinnedLanguagePairs.some(p => languagePairKey(p) === key)
  const resolvedSource = pair.source === 'auto' ? (scope === 'translate' ? detectedSourceLang : null) : pair.source
  const canSwap = !locked && Boolean(resolvedSource && resolvedSource !== pair.target)
  const change = (next: LanguagePair) => {
    if (locked) return
    if (onPairChange) onPairChange(next)
    else state.setLanguagePair(scope, next)
  }
  const select = (p: LanguagePair) => change(state.languagePairDirections[scope][languagePairKey(p)] ?? p)
  const label = (p: LanguagePair) => `${t.lang_names[p.source] ?? p.source}${p.source === 'auto' ? ' → ' : '–'}${t.lang_names[p.target] ?? p.target}`
  const pairButton = (p: LanguagePair) => (
    <Button key={languagePairKey(p)} size="sm" shape="pill" variant={key === languagePairKey(p) ? 'primary' : 'neutral'}
      appearance={key === languagePairKey(p) ? 'soft' : 'ghost'} aria-pressed={key === languagePairKey(p)}
      disabled={locked} onClick={() => { select(p); close() }}>{label(p)}</Button>
  )
  return (
    <div className="language-pair-controls">
      <div className="language-pair-fields">
        <TranslationLanguageControls sourceHeadingId={sourceHeadingId} resultHeadingId={resultHeadingId}
          sourceLang={pair.source} targetLang={pair.target} detectedSourceLang={detectedSourceLang} isDetectingLang={isDetectingLang}
          disabled={locked} canSwap={canSwap} swapDisabledReason={locked ? t.language_pairs_locked
            : resolvedSource === pair.target ? t.language_pairs_same : t.translate_swap_disabled_auto}
          onSourceLangChange={source => change({ ...pair, source })} onTargetLangChange={target => change({ ...pair, target })}
          onSwap={() => { if (canSwap && resolvedSource) change({ source: pair.target, target: resolvedSource }) }} />
        <div className="language-pair-trigger-slot">
          <Button ref={triggerRef} size="md" shape="rect" variant={open ? 'primary' : 'neutral'} appearance={open ? 'soft' : 'ghost'}
            className="language-pair-trigger" aria-label={t.language_pairs_manage} title={t.language_pairs_manage}
            aria-haspopup="dialog" aria-expanded={open && !locked} aria-controls={open && !locked ? panelId : undefined}
            disabled={locked} onClick={() => { setPosition(null); setOpen(value => !value) }}>
            <TranslateIcon /><span>{t.language_pairs_manage}</span><ChevronDownIcon className="language-pair-trigger-chevron" />
          </Button>
        </div>
      </div>
      {open && !locked && createPortal(
        <div ref={panelRef} id={panelId} role="dialog" aria-label={t.language_pairs_manage} className="language-pair-popover"
          style={{ ...position, visibility: position ? 'visible' : 'hidden' }}>
          <div className="language-pair-popover-header">
            <strong>{t.language_pairs_manage}</strong>
            <Button size="sm" shape="icon" variant="neutral" appearance="ghost" aria-label={t.settings_close} onClick={() => close()}><XIcon /></Button>
          </div>
          <div className="language-pair-menu-list">
            {state.pinnedLanguagePairs.map(p => (
              <div className="language-pair-menu-row" key={languagePairKey(p)}>
                {pairButton(p)}
                <Button size="sm" shape="icon" variant="neutral" appearance="ghost"
                  aria-label={`${t.language_pairs_unpin}: ${label(p)}`} onClick={() => {
                    state.unpinLanguagePair(languagePairKey(p))
                    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
                  }}><XIcon /></Button>
              </div>
            ))}
          </div>
          <div className="language-pair-popover-footer">
            <Button size="sm" shape="rect" variant="neutral" appearance="outline"
              disabled={pinned || pair.source === pair.target} onClick={() => { state.pinLanguagePair(pair); close() }}>
              {pinned ? t.language_pairs_saved : t.language_pairs_pin}
            </Button>
          </div>
        </div>, document.body,
      )}
      {locked && <p className="language-pair-notice" role="status">{t.language_pairs_locked}</p>}
    </div>
  )
}
