import { type RefObject, useCallback, useId, useRef, useState } from 'react'
import '../../../styles/language-picker.css'
import { Button } from '../atoms'
import { ChevronDownIcon } from '../icons'
import { OptionPickerPanel, type PickerOption } from './OptionPickerPanel'

export interface OptionPickerProps {
  id?: string
  value: string
  options: readonly PickerOption[]
  onChange: (value: string) => void
  /** Accessible name for the trigger and the dialog. */
  label: string
  /** Providing a placeholder adds a search box inside the panel. */
  searchPlaceholder?: string
  noResultsLabel?: string
  disabled?: boolean
  /** Receives focus after a keyboard close or a selection; defaults to the trigger. */
  returnFocusRef?: RefObject<HTMLElement | null>
  className?: string
}

/** App-owned single-value dropdown used instead of an OS-native select. */
export function OptionPicker({
  id,
  value,
  options,
  onChange,
  label,
  searchPlaceholder,
  noResultsLabel,
  disabled = false,
  returnFocusRef,
  className = '',
}: OptionPickerProps) {
  const generatedId = useId()
  const panelId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  const selected = options.find((option) => option.value === value) ?? options[0]

  const closePicker = useCallback((restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) window.requestAnimationFrame(() => (returnFocusRef?.current ?? triggerRef.current)?.focus())
  }, [returnFocusRef])

  return (
    <div className={`option-picker${className ? ` ${className}` : ''}`}>
      <Button
        ref={triggerRef}
        id={id ?? generatedId}
        size="md"
        shape="rect"
        variant={open ? 'primary' : 'neutral'}
        appearance={open ? 'soft' : 'outline'}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`${label}: ${selected?.label ?? ''}`}
        onClick={() => setOpen((current) => !current)}
        className="language-picker-trigger option-picker-trigger"
      >
        <span className="language-picker-trigger-label">{selected?.label}</span>
        <ChevronDownIcon className={`language-picker-chevron${open ? ' language-picker-chevron--open' : ''}`} />
      </Button>
      <OptionPickerPanel
        id={panelId}
        open={open}
        anchorRef={triggerRef}
        onClose={closePicker}
        value={value}
        options={options}
        onChange={onChange}
        label={label}
        searchPlaceholder={searchPlaceholder}
        noResultsLabel={noResultsLabel}
      />
    </div>
  )
}
