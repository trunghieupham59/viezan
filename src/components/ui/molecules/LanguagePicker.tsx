import { useCallback, useId, useRef, useState } from 'react'
import '../../../styles/language-picker.css'
import type { Language } from '../../../types'
import { Button } from '../atoms'
import { ChevronDownIcon, SpinnerIcon } from '../icons'
import { LanguagePickerPanel } from './LanguagePickerPanel'

export interface LanguagePickerProps {
  value: string
  options: readonly Language[]
  onChange: (language: string) => void
  getLabel: (language: Language) => string
  label?: string
  labelVisuallyHidden?: boolean
  searchPlaceholder: string
  noResultsLabel: string
  status?: string
  statusBusy?: boolean
  disabled?: boolean
  /** `inline` hugs its content with a borderless trigger for command bars. */
  variant?: 'field' | 'inline'
  className?: string
}

/** App-owned searchable language picker used instead of an OS-native select. */
export function LanguagePicker({
  value,
  options,
  onChange,
  getLabel,
  label,
  labelVisuallyHidden = false,
  searchPlaceholder,
  noResultsLabel,
  status,
  statusBusy = false,
  disabled = false,
  variant = 'field',
  className = '',
}: LanguagePickerProps) {
  const triggerId = useId()
  const labelId = useId()
  const panelId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  const selectedLanguage = options.find((language) => language.code === value) ?? options[0]
  const selectedLabel = selectedLanguage ? getLabel(selectedLanguage) : value

  const closePicker = useCallback((restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])

  return (
    <div className={`language-picker${variant === 'inline' ? ' language-picker--inline' : ''}${className ? ` ${className}` : ''}`}>
      {label && (
        <span
          id={labelId}
          className={labelVisuallyHidden ? 'sr-only' : 'language-picker-label'}
        >
          {label}
        </span>
      )}
      <Button
        ref={triggerRef}
        id={triggerId}
        size="md"
        shape="rect"
        variant={open ? 'primary' : 'neutral'}
        appearance={open ? 'soft' : variant === 'inline' ? 'ghost' : 'outline'}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-labelledby={label ? `${labelId} ${triggerId}` : undefined}
        aria-label={label ? undefined : selectedLabel}
        onClick={() => setOpen((current) => !current)}
        className="language-picker-trigger"
      >
        <span className="language-picker-trigger-label">{selectedLabel}</span>
        {status && (
          <span className="language-picker-trigger-status" role="status" aria-live="polite">
            {statusBusy && <SpinnerIcon className="language-picker-status-spinner" />}
            <span>{status}</span>
          </span>
        )}
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
        label={label ?? selectedLabel}
        searchPlaceholder={searchPlaceholder}
        noResultsLabel={noResultsLabel}
      />
    </div>
  )
}
