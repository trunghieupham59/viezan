import { type CSSProperties, type KeyboardEvent, type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { foldSearchText } from '../../../utils/foldSearchText'
import { Button } from '../atoms/Button'
import { CheckIcon } from '../icons'
import { FilterInput } from './FilterInput'
import '../../../styles/molecules.css'

export interface OptionFlyoutOption {
  value: string
  label: string
}

export interface OptionFlyoutProps {
  id?: string
  open: boolean
  /** The row the flyout belongs to; it lines up with this row and returns focus to it. */
  anchorRef: RefObject<HTMLElement | null>
  /** Accessible name of the listbox, e.g. "Target language". */
  label: string
  value: string
  options: readonly OptionFlyoutOption[]
  onSelect: (value: string) => void
  /** `restoreFocus` is true when the keyboard closed it and focus should return to the row. */
  onClose: (restoreFocus: boolean) => void
  /** Providing a placeholder adds a search field above the list; omit it for short lists. */
  searchPlaceholder?: string
  noResultsLabel?: string
  /** Accessible name of the search field's clear button. */
  clearSearchLabel?: string
}

type Rect = Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left' | 'width'>

export interface FlyoutPlacement {
  side: 'end' | 'start' | 'below'
  top: number
  left: number
  /** Block size available to the list; it scrolls past this. */
  room: number
  /** Set only below the row, where the flyout takes the row's width. */
  width?: number
}

/**
 * Secondary list placement: beside the surface that holds the row (`boundary`,
 * e.g. the popover), on the end side, else the start side, else under the row
 * when neither side has room (compact windows).
 */
export function placeFlyout(anchor: Rect, boundary: Rect, size: { width: number; height: number },
  viewport: { width: number; height: number }, gap: number, margin: number): FlyoutPlacement {
  const sideRoom = viewport.height - margin * 2
  const sideTop = Math.max(margin, Math.min(anchor.top, viewport.height - margin - Math.min(size.height, sideRoom)))
  if (boundary.right + gap + size.width <= viewport.width - margin) {
    return { side: 'end', top: sideTop, left: boundary.right + gap, room: sideRoom }
  }
  if (boundary.left - gap - size.width >= margin) {
    return { side: 'start', top: sideTop, left: boundary.left - gap - size.width, room: sideRoom }
  }
  const top = anchor.bottom + gap
  return { side: 'below', top, left: anchor.left, room: Math.max(0, viewport.height - margin - top), width: anchor.width }
}

const readSpace = (name: string) =>
  Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0

/**
 * A secondary option list that opens beside its row instead of over it, so a
 * choice made inside a popover never covers the popover's own list. The
 * nearest `[data-flyout-boundary]` ancestor of the row is the edge it clears.
 * Long lists get a search field that ignores diacritics.
 */
export function OptionFlyout({
  id, open, anchorRef, label, value, options, onSelect, onClose,
  searchPlaceholder, noResultsLabel = '', clearSearchLabel = '',
}: OptionFlyoutProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const optionRefs = useRef(new Map<string, HTMLButtonElement>())
  const [placement, setPlacement] = useState<FlyoutPlacement | null>(null)
  const [query, setQuery] = useState('')
  const searchable = searchPlaceholder !== undefined

  const folded = foldSearchText(query.trim())
  const visible = useMemo(() => (
    folded ? options.filter((option) => foldSearchText(`${option.label} ${option.value}`).includes(folded)) : options
  ), [folded, options])
  const selectedIndex = visible.findIndex((option) => option.value === value)
  // One tab stop in the list: the chosen option when it is shown, else the first.
  const tabStop = Math.max(0, selectedIndex)

  const measure = useCallback(() => {
    const anchor = anchorRef.current
    const root = rootRef.current
    if (!anchor || !root) return
    const boundary = anchor.closest<HTMLElement>('[data-flyout-boundary]') ?? anchor
    setPlacement(placeFlyout(
      anchor.getBoundingClientRect(),
      boundary.getBoundingClientRect(),
      // The rendered size, already capped by the stylesheet's max block size.
      { width: root.offsetWidth, height: root.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
      readSpace('--vzn-space-2'),
      readSpace('--vzn-space-4'),
    ))
  }, [anchorRef])

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null)
      setQuery('')
      return
    }
    measure()
    window.addEventListener('resize', measure)
    // The row moves when the surface around it scrolls.
    document.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      document.removeEventListener('scroll', measure, true)
    }
  }, [measure, open])

  // Filtering changes the height; keep a list near the window's bottom edge inside it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the visible options change
  useLayoutEffect(() => {
    if (open) measure()
  }, [visible.length])

  // biome-ignore lint/correctness/useExhaustiveDependencies: focus moves in only when the flyout opens
  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      if (searchRef.current) searchRef.current.focus()
      else optionRefs.current.get(value)?.focus()
    })
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (rootRef.current?.contains(target) || anchorRef.current?.contains(target)) return
      onClose(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [open])

  if (!open) return null

  const choose = (optionValue: string) => {
    onSelect(optionValue)
    onClose(true)
  }

  const back = placement?.side === 'start' ? 'ArrowRight' : 'ArrowLeft'
  // The flyout owns Escape: the surface around it stays open.
  const closeFromKeyboard = (event: KeyboardEvent) => {
    event.preventDefault()
    event.stopPropagation()
    onClose(true)
  }

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
    if (event.key === 'Escape') {
      closeFromKeyboard(event)
    } else if (event.key === 'Enter') {
      // Enter takes the best match: the chosen option when it is still shown, else the first.
      event.preventDefault()
      event.stopPropagation()
      const match = visible[tabStop]
      if (match) choose(match.value)
    } else if (event.key === 'ArrowDown' && visible.length > 0) {
      event.preventDefault()
      optionRefs.current.get(visible[tabStop].value)?.focus()
    }
  }

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowUp' && index === 0 && searchable) {
      event.preventDefault()
      searchRef.current?.focus()
      return
    }
    const last = visible.length - 1
    const target = event.key === 'ArrowDown' ? (index + 1) % visible.length
      : event.key === 'ArrowUp' ? (index - 1 + visible.length) % visible.length
        : event.key === 'Home' ? 0
          : event.key === 'End' ? last
            : null
    if (target !== null) {
      event.preventDefault()
      optionRefs.current.get(visible[target].value)?.focus()
    } else if (event.key === 'Escape' || event.key === back) {
      closeFromKeyboard(event)
    } else if (event.key === 'Tab') {
      onClose(false)
    }
  }

  const style = {
    top: placement?.top,
    left: placement?.left,
    visibility: placement ? undefined : 'hidden',
    ...(placement ? { '--option-flyout-room': `${placement.room}px` } : {}),
    ...(placement?.width != null ? { '--option-flyout-inline': `${placement.width}px` } : {}),
  } as CSSProperties

  return (
    <div ref={rootRef} className={`option-flyout option-flyout--${placement?.side ?? 'end'}`} style={style}>
      {searchable && (
        <FilterInput
          ref={searchRef}
          size="sm"
          role="searchbox"
          value={query}
          onValueChange={setQuery}
          onKeyDown={handleSearchKeyDown}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          aria-controls={id}
          clearLabel={clearSearchLabel}
          wrapperClassName="option-flyout__search"
        />
      )}
      <div id={id} role="listbox" aria-label={label} className="option-flyout__list">
        {visible.map((option, index) => {
          const selected = option.value === value
          return (
            <Button
              key={option.value}
              ref={(node) => {
                if (node) optionRefs.current.set(option.value, node)
                else optionRefs.current.delete(option.value)
              }}
              role="option"
              aria-selected={selected}
              tabIndex={index === tabStop ? 0 : -1}
              size="md"
              shape="rect"
              variant={selected ? 'primary' : 'neutral'}
              appearance={selected ? 'soft' : 'ghost'}
              className="option-flyout__option"
              onClick={() => choose(option.value)}
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
            >
              <span className="option-flyout__label">{option.label}</span>
              {selected && <CheckIcon className="option-flyout__check" aria-hidden="true" />}
            </Button>
          )
        })}
        {visible.length === 0 && (
          <p className="option-flyout__empty" role="status">{noResultsLabel}</p>
        )}
      </div>
    </div>
  )
}
