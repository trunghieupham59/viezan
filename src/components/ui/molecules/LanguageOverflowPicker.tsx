import { useCallback, useId, useRef, useState } from 'react'
import '../../../styles/language-picker.css'
import type { Language } from '../../../types'
import { Button } from '../atoms'
import { ChevronDownIcon } from '../icons'
import { LanguagePickerPanel } from './LanguagePickerPanel'

export interface LanguageOverflowPickerProps {
  /** Selected code, or null when the selection is not part of `options`. */
  value: string | null
  options: readonly Language[]
  onChange: (language: string) => void
  getLabel: (language: Language) => string
  /** Accessible name for the icon-only trigger and the dialog. */
  label: string
  searchPlaceholder: string
  noResultsLabel: string
  /** True when the current language is reached only through this menu. */
  active?: boolean
  disabled?: boolean
}

/** Icon-only chevron that opens the full searchable language list for quick-tab bars. */
export function LanguageOverflowPicker({
  value,
  options,
  onChange,
  getLabel,
  label,
  searchPlaceholder,
  noResultsLabel,
  active = false,
  disabled = false,
}: LanguageOverflowPickerProps) {
  const panelId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  const closePicker = useCallback((restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])

  const highlighted = open || active

  return (
    <>
      <Button
        ref={triggerRef}
        size="md"
        shape="icon"
        variant={highlighted ? 'primary' : 'neutral'}
        appearance={highlighted ? 'soft' : 'ghost'}
        disabled={disabled}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((current) => !current)}
        className="language-overflow-trigger"
      >
        <ChevronDownIcon className={`language-picker-chevron${open ? ' language-picker-chevron--open' : ''}`} />
      </Button>
      <LanguagePickerPanel
        id={panelId}
        open={open}
        anchorRef={triggerRef}
        onClose={closePicker}
        value={value}
        options={options}
        onChange={onChange}
        getLabel={getLabel}
        label={label}
        searchPlaceholder={searchPlaceholder}
        noResultsLabel={noResultsLabel}
      />
    </>
  )
}
