import {
  type KeyboardEvent,
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

const VIEWPORT_MARGIN = 8
const PICKER_GAP = 6
const PICKER_MAX_HEIGHT = 360
const PICKER_MIN_HEIGHT = 120

export interface PickerOption {
  value: string
  label: string
  /** Secondary text shown at the row end, e.g. a native language name. */
  hint?: string
  /** Extra text matched by the search box in addition to the label and hint. */
  searchText?: string
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
  minWidth = 280,
}: OptionPickerPanelProps) {
  const listId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const optionRefs = useRef(new Map<string, HTMLButtonElement>())
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
    const availableBelow = window.innerHeight - rect.bottom - PICKER_GAP - VIEWPORT_MARGIN
    const availableAbove = rect.top - PICKER_GAP - VIEWPORT_MARGIN
    const placement = availableBelow >= Math.min(PICKER_MAX_HEIGHT, availableAbove) ? 'below' : 'above'
    const available = placement === 'below' ? availableBelow : availableAbove
    const maxHeight = Math.max(PICKER_MIN_HEIGHT, Math.min(PICKER_MAX_HEIGHT, available))
    const width = Math.min(Math.max(rect.width, minWidth), window.innerWidth - VIEWPORT_MARGIN * 2)
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.left),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN),
    )
    const top = placement === 'below'
      ? rect.bottom + PICKER_GAP
      : Math.max(VIEWPORT_MARGIN, rect.top - PICKER_GAP - maxHeight)

    setPosition({ top, left, width, maxHeight, placement })
  }, [anchorRef, minWidth])

  useLayoutEffect(() => {
    if (open) {
      updatePosition()
      return
    }
    setQuery('')
    setPosition(null)
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return

    const frame = window.requestAnimationFrame(() => {
      updatePosition()
      if (searchRef.current) {
        searchRef.current.focus()
        return
      }
      const target = (value && optionRefs.current.get(value)) || optionRefs.current.values().next().value
      target?.focus()
    })
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
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [anchorRef, onClose, open, updatePosition, value])

  if (!open) return null

  const selectOption = (option: PickerOption) => {
    if (option.value !== value) onChange(option.value)
    onClose(true)
  }

  const focusOption = (optionValue: string) => {
    window.requestAnimationFrame(() => optionRefs.current.get(optionValue)?.focus())
  }

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'ArrowDown' || filteredOptions.length === 0) return
    event.preventDefault()
    const selectedIsVisible = filteredOptions.some((option) => option.value === value)
    focusOption(selectedIsVisible && value ? value : filteredOptions[0].value)
  }

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null
    if (event.key === 'ArrowDown') nextIndex = Math.min(index + 1, filteredOptions.length - 1)
    if (event.key === 'ArrowUp') nextIndex = index === 0 ? null : index - 1
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = filteredOptions.length - 1
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
        top: position?.top ?? VIEWPORT_MARGIN,
        left: position?.left ?? VIEWPORT_MARGIN,
        width: position?.width ?? minWidth,
        maxHeight: position?.maxHeight ?? PICKER_MAX_HEIGHT,
        visibility: position ? 'visible' : 'hidden',
        zIndex: 9999,
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
              aria-selected={isSelected}
              onClick={() => selectOption(option)}
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
              className="language-picker-option"
            >
              <span className="language-picker-option-copy">
                <span className="language-picker-option-label">{option.label}</span>
                {option.hint && (
                  <span className="language-picker-option-native">{option.hint}</span>
                )}
              </span>
              {isSelected && <CheckIcon className="language-picker-check" />}
            </Button>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}
