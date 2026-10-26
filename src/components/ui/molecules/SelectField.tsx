import { type CSSProperties, type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react'
import { foldSearchText } from '../../../utils/foldSearchText'
import { Button } from '../atoms'
import { CheckIcon, ChevronDownIcon, SpinnerIcon } from '../icons'
import { FilterInput } from './FilterInput'

export interface SelectFieldOption {
  value: string
  label: string
  /** Short hint shown beside the label so similar choices stay distinguishable. */
  description?: string
  disabled?: boolean
}

export interface SelectFieldProps {
  id?: string
  label: string
  value: string
  options: readonly SelectFieldOption[]
  onChange: (value: string) => void
  disabled?: boolean
  disabledHint?: string
  busy?: boolean
  autoFocusTarget?: boolean
  className?: string
  /** Providing a placeholder adds a search field above long lists; it ignores diacritics. */
  searchPlaceholder?: string
  noResultsLabel?: string
  /** Accessible name of the search field's clear button. */
  clearSearchLabel?: string
}

/** Accessible single-value selector used by AI configuration surfaces. */
export function SelectField({
  id,
  label,
  value,
  options,
  onChange,
  disabled = false,
  disabledHint,
  busy = false,
  autoFocusTarget = false,
  className = '',
  searchPlaceholder,
  noResultsLabel = '',
  clearSearchLabel = '',
}: SelectFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const labelId = `${fieldId}-label`
  const menuId = `${fieldId}-menu`
  // The menu floats over the page anchored to this trigger, so a scrolling
  // parent (a popover body, a settings list) never clips it.
  const anchorName = `--vzn-select-${generatedId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<'above' | 'below'>('below')
  const [query, setQuery] = useState('')
  const searchable = searchPlaceholder !== undefined
  const selectedOption = options.find((option) => option.value === value) ?? options[0]

  // Options shown in the menu: all of them, or the search matches (label, description, value).
  const folded = searchable ? foldSearchText(query.trim()) : ''
  const visible = useMemo(() => (
    folded
      ? options.filter((option) => foldSearchText(`${option.label} ${option.description ?? ''} ${option.value}`).includes(folded))
      : options
  ), [folded, options])
  const selectedIndex = Math.max(0, visible.findIndex((option) => option.value === value))

  const close = (restoreFocus: boolean) => {
    setOpen(false)
    setQuery('')
    if (restoreFocus) triggerRef.current?.focus()
  }

  const openMenu = (preferredIndex = selectedIndex) => {
    if (disabled) return
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) setPlacement(window.innerHeight - rect.bottom < rect.top ? 'above' : 'below')
    setOpen(true)
    window.requestAnimationFrame(() => {
      if (!searchRef.current) {
        optionRefs.current[preferredIndex]?.focus()
        return
      }
      searchRef.current.focus()
      // Focus stays in the field; still show where the current choice sits in the list.
      optionRefs.current[preferredIndex]?.scrollIntoView?.({ block: 'nearest' })
    })
  }

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      const root = triggerRef.current?.closest('.ai-select-field')
      if (root && !root.contains(target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  const focusBoundaryOption = (boundary: 'first' | 'last') => {
    const enabled = visible
      .map((option, optionIndex) => ({ option, optionIndex }))
      .filter(({ option }) => !option.disabled)
    if (enabled.length === 0) return
    const next = boundary === 'first' ? enabled[0] : enabled[enabled.length - 1]
    optionRefs.current[next.optionIndex]?.focus()
  }

  const moveFocus = (currentIndex: number, direction: 1 | -1) => {
    const enabledIndexes = visible
      .map((option, index) => option.disabled ? -1 : index)
      .filter((index) => index >= 0)
    if (enabledIndexes.length === 0) return
    const current = enabledIndexes.indexOf(currentIndex)
    const next = enabledIndexes[(current + direction + enabledIndexes.length) % enabledIndexes.length]
    optionRefs.current[next]?.focus()
  }

  const optionButtons = visible.map((option, index) => (
    <Button
      key={option.value}
      ref={(element) => { optionRefs.current[index] = element }}
      id={`${fieldId}-option-${index}`}
      role="option"
      aria-selected={option.value === value}
      aria-label={option.label}
      aria-describedby={option.description ? `${fieldId}-option-${index}-description` : undefined}
      size="md"
      shape="rect"
      variant={option.value === value ? 'primary' : 'neutral'}
      appearance={option.value === value ? 'soft' : 'ghost'}
      disabled={option.disabled}
      className="ai-select-field__option"
      onClick={() => {
        onChange(option.value)
        close(true)
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp' && index === 0 && searchable) {
          // From the first option, ArrowUp goes back to the search field.
          event.preventDefault()
          searchRef.current?.focus()
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          moveFocus(index, event.key === 'ArrowDown' ? 1 : -1)
        } else if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault()
          focusBoundaryOption(event.key === 'Home' ? 'first' : 'last')
        } else if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          close(true)
        } else if (event.key === 'Tab') {
          close(false)
        }
      }}
    >
      <span className="ai-select-field__option-copy">
        <span className="ai-select-field__option-label">{option.label}</span>
        {option.description && (
          <span
            id={`${fieldId}-option-${index}-description`}
            className="ai-select-field__option-description"
            title={option.description}
          >
            {option.description}
          </span>
        )}
      </span>
      {option.value === value && <CheckIcon className="ai-select-field__check" />}
    </Button>
  ))

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
    if (event.key === 'Escape') {
      // The open menu owns Escape so an enclosing popover stays open.
      event.preventDefault()
      event.stopPropagation()
      close(true)
    } else if (event.key === 'Enter') {
      // Enter takes the best match: the chosen option when it is still shown, else the first enabled one.
      event.preventDefault()
      event.stopPropagation()
      const shown = visible[selectedIndex]
      const match = shown && !shown.disabled ? shown : visible.find((option) => !option.disabled)
      if (match) {
        onChange(match.value)
        close(true)
      }
    } else if (event.key === 'ArrowDown' && visible.length > 0) {
      event.preventDefault()
      optionRefs.current[selectedIndex]?.focus()
    }
  }

  return (
    <div className={`ai-select-field${className ? ` ${className}` : ''}`}>
      <span id={labelId} className="ai-select-field__label">{label}</span>
      <Button
        ref={triggerRef}
        id={fieldId}
        size="md"
        shape="rect"
        variant="neutral"
        appearance={open ? 'soft' : 'outline'}
        disabled={disabled}
        title={disabled ? disabledHint : undefined}
        aria-labelledby={`${labelId} ${fieldId}-value`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-ai-config-autofocus={autoFocusTarget ? '' : undefined}
        className="ai-select-field__trigger"
        style={{ anchorName } as CSSProperties}
        onClick={() => open ? close(false) : openMenu()}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            // The menu can be open before its option takes focus; the open
            // listbox still owns Escape so an enclosing popover stays open.
            event.preventDefault()
            event.stopPropagation()
            close(true)
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            openMenu(event.key === 'ArrowDown' ? selectedIndex : options.length - 1)
          } else if (event.key === 'Home') {
            event.preventDefault()
            openMenu(0)
          } else if (event.key === 'End') {
            event.preventDefault()
            openMenu(options.length - 1)
          }
        }}
      >
        <span id={`${fieldId}-value`} className="ai-select-field__value">
          {selectedOption?.label}
        </span>
        {busy ? <SpinnerIcon className="ai-select-field__spinner" /> : <ChevronDownIcon className="ai-select-field__chevron" />}
      </Button>

      {open && (searchable ? (
        <div className={`ai-select-field__menu ai-select-field__menu--searchable ai-select-field__menu--${placement}`}
          style={{ positionAnchor: anchorName } as CSSProperties}>
          <FilterInput
            ref={searchRef}
            size="sm"
            role="searchbox"
            value={query}
            onValueChange={setQuery}
            onKeyDown={handleSearchKeyDown}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            aria-controls={menuId}
            clearLabel={clearSearchLabel}
            wrapperClassName="ai-select-field__search"
          />
          <div id={menuId} role="listbox" aria-labelledby={labelId} className="ai-select-field__list">
            {optionButtons}
            {visible.length === 0 && <p className="ai-select-field__empty" role="status">{noResultsLabel}</p>}
          </div>
        </div>
      ) : (
        <div
          id={menuId}
          role="listbox"
          aria-labelledby={labelId}
          className={`ai-select-field__menu ai-select-field__menu--${placement}`}
          style={{ positionAnchor: anchorName } as CSSProperties}
        >
          {optionButtons}
        </div>
      ))}
    </div>
  )
}
