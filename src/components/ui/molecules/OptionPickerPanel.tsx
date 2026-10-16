import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import '../../../styles/language-picker.css'
import { Button, Input } from '../atoms'
import { CheckIcon, SearchIcon } from '../icons'

export interface PickerOption {
  value: string
  label: string
  /** Decorative leading icon; the label remains the accessible name. */
  icon?: ReactNode
  /** Secondary text shown at the row end, e.g. a native language name. */
  hint?: string
  /** Extra text matched by the search box in addition to the label and hint. */
  searchText?: string
  disabled?: boolean
}

interface PanelPosition {
  top: number
  left: number
  width: number
  maxHeight: number
  placement: 'above' | 'below'
}

export interface OptionPickerPanelProps {
  /** DOM id for the dialog, so the trigger can reference it via `aria-controls`. */
  id?: string
  open: boolean
  /** Element the panel is anchored to; clicks on it do not count as outside. */
  anchorRef: RefObject<HTMLElement | null>
  /** Called on outside click, Escape, or selection. `restoreFocus` is true for keyboard/selection exits. */
  onClose: (restoreFocus: boolean) => void
  value: string | null
  options: readonly PickerOption[]
  onChange: (value: string) => void
  label: string
  /** Providing a placeholder shows the search box; omit it for short lists. */
  searchPlaceholder?: string
  noResultsLabel?: string
  /** Smallest panel width in px; the panel is never narrower than its anchor. */
  minWidth?: number
}

/**
 * Option list in a body portal, positioned against an anchor, with optional
 * search. Shared by every app-owned dropdown that replaces an OS-native select.
 */
export function OptionPickerPanel({
  id,
  open,
  anchorRef,
  onClose,
  value,
  options,
  onChange,
  label,
  searchPlaceholder,
  noResultsLabel = '',
  minWidth,
}: OptionPickerPanelProps) {
  const listId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const optionRefs = useRef(new Map<string, HTMLButtonElement>())
  const placementRef = useRef<'above' | 'below' | null>(null)
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState<PanelPosition | null>(null)
  const searchable = searchPlaceholder !== undefined

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredOptions = useMemo(() => {
    if (!searchable || !normalizedQuery) return options
    return options.filter((option) => (
      `${option.label} ${option.hint ?? ''} ${option.searchText ?? ''}`
        .toLocaleLowerCase()
        .includes(normalizedQuery)
    ))
  }, [normalizedQuery, options, searchable])

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current
    if (!anchor) return

    const rect = anchor.getBoundingClientRect()
    const tokens = getComputedStyle(document.documentElement)
    const pixels = (name: string) => Number.parseFloat(tokens.getPropertyValue(name)) || 0
    const margin = pixels('--vzn-space-2')
    const gap = pixels('--vzn-space-1-5')
    const maximumHeight = pixels('--vzn-picker-max-block')
    const availableBelow = Math.max(0, window.innerHeight - rect.bottom - gap - margin)
    const availableAbove = Math.max(0, rect.top - gap - margin)
    // Layout height excludes the opening animation's temporary scale transform.
    const measuredHeight = panelRef.current?.offsetHeight ?? 0
    const preferred = placementRef.current
    const preferredSpace = preferred === 'above' ? availableAbove : availableBelow
    const placement = preferred && preferredSpace >= Math.min(measuredHeight, maximumHeight)
      ? preferred : availableBelow >= Math.min(measuredHeight, availableAbove) ? 'below' : 'above'
    placementRef.current = placement
    const available = placement === 'below' ? availableBelow : availableAbove
    const maxHeight = Math.min(maximumHeight, available)
    const height = Math.min(measuredHeight, maxHeight)
    const width = Math.min(Math.max(rect.width, minWidth ?? pixels('--vzn-picker-min-inline')), Math.max(0, window.innerWidth - margin * 2))
    const left = Math.min(
      Math.max(margin, rect.left),
      Math.max(margin, window.innerWidth - width - margin),
    )
    const top = placement === 'below'
      ? rect.bottom + gap
      : Math.max(margin, rect.top - gap - height)

    setPosition((current) => current?.top === top && current.left === left && current.width === width
      && current.maxHeight === maxHeight && current.placement === placement
      ? current : { top, left, width, maxHeight, placement })
  }, [anchorRef, minWidth])

  useLayoutEffect(() => {
    if (open) {
      updatePosition()
      return
    }
    setQuery('')
    setPosition(null)
    placementRef.current = null
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return

    const frame = window.requestAnimationFrame(() => {
      updatePosition()
      if (searchRef.current) {
        searchRef.current.focus()
        return
      }
      const initial = filteredOptions.find((option) => option.value === value && !option.disabled)
        ?? filteredOptions.find((option) => !option.disabled)
      const target = initial ? optionRefs.current.get(initial.value) : null
      target?.focus()
    })
    // Filtering, wrapping, or a layout change can resize either surface while open.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePosition)
    if (panelRef.current) observer?.observe(panelRef.current)
    if (anchorRef.current) observer?.observe(anchorRef.current)
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return
      onClose(false)
    }
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      // Close only the picker, not a host dialog listening for Escape on window.
      event.stopPropagation()
      onClose(true)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [anchorRef, onClose, open, updatePosition, value, filteredOptions])

  if (!open) return null

  const selectOption = (option: PickerOption) => {
    if (option.disabled) return
    if (option.value !== value) onChange(option.value)
    onClose(true)
  }

  const focusOption = (optionValue: string) => {
    window.requestAnimationFrame(() => optionRefs.current.get(optionValue)?.focus())
  }

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      const first = filteredOptions.find((option) => !option.disabled)
      if (first) selectOption(first)
      return
    }
    if (event.key !== 'ArrowDown' || filteredOptions.length === 0) return
    event.preventDefault()
    const selectedIsVisible = filteredOptions.some((option) => option.value === value)
    const first = filteredOptions.find((option) => !option.disabled)
    if (first) focusOption(selectedIsVisible && value && !filteredOptions.find((option) => option.value === value)?.disabled ? value : first.value)
  }

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const enabled = filteredOptions.map((option, i) => option.disabled ? -1 : i).filter((i) => i >= 0)
    const current = enabled.indexOf(index)
    let nextIndex: number | null = null
    if (event.key === 'ArrowDown') nextIndex = enabled[Math.min(current + 1, enabled.length - 1)] ?? null
    if (event.key === 'ArrowUp') nextIndex = current === 0 ? null : enabled[current - 1]
    if (event.key === 'Home') nextIndex = enabled[0] ?? null
    if (event.key === 'End') nextIndex = enabled[enabled.length - 1] ?? null
    if (nextIndex === null) {
      if (event.key === 'ArrowUp' && index === 0 && searchable) {
        event.preventDefault()
        searchRef.current?.focus()
      }
      return
    }
    event.preventDefault()
    focusOption(filteredOptions[nextIndex].value)
  }

  return createPortal(
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-label={label}
      className={`language-picker-panel language-picker-panel--${position?.placement ?? 'below'}`}
      style={{
        position: 'fixed',
        top: position?.top ?? 'var(--vzn-space-2)',
        left: position?.left ?? 'var(--vzn-space-2)',
        width: position?.width ?? minWidth ?? 'var(--vzn-picker-min-inline)',
        maxHeight: position?.maxHeight ?? 'var(--vzn-picker-max-block)',
        visibility: position ? 'visible' : 'hidden',
        zIndex: 'var(--vzn-layer-picker)',
      }}
    >
      {searchable && (
        <div className="language-picker-search-shell">
          <SearchIcon className="language-picker-search-icon" />
          <Input
            ref={searchRef}
            size="md"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            aria-controls={listId}
            className="language-picker-search"
          />
        </div>
      )}

      <div id={listId} role="listbox" aria-label={label} className="language-picker-list">
        {filteredOptions.length === 0 && (
          <p className="language-picker-empty" role="status">{noResultsLabel}</p>
        )}
        {filteredOptions.map((option, index) => {
          const isSelected = option.value === value

          return (
            <Button
              key={option.value}
              ref={(node) => {
                if (node) optionRefs.current.set(option.value, node)
                else optionRefs.current.delete(option.value)
              }}
              size="md"
              shape="rect"
              variant={isSelected ? 'primary' : 'neutral'}
              appearance={isSelected ? 'soft' : 'ghost'}
              role="option"
              aria-label={option.label}
              aria-description={option.hint}
              aria-selected={isSelected}
              disabled={option.disabled}
              title={option.label}
              onClick={() => selectOption(option)}
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
              className="language-picker-option"
            >
              {option.icon && <span className="option-picker-option-icon" aria-hidden="true">{option.icon}</span>}
              <span className="language-picker-option-copy">
                <span className="language-picker-option-label">{option.label}</span>
                {option.hint && !option.disabled && (
                  <span className="language-picker-option-native">{option.hint}</span>
                )}
              </span>
              {isSelected && <CheckIcon className="language-picker-check" />}
            </Button>
          )
        })}
      </div>
      {filteredOptions.filter((option) => option.disabled && option.hint).map((option) => (
        <p key={option.value} className="option-picker-disabled-hint">{option.hint}</p>
      ))}
    </div>,
    document.body,
  )
}
