import { forwardRef, type ReactNode, useImperativeHandle, useRef } from 'react'
import { Button, Input, type InputProps, type InputSize } from '../atoms'
import { SearchIcon, XIcon } from '../icons'
import '../../../styles/molecules.css'

export interface FilterInputProps extends Omit<InputProps, 'value' | 'onChange' | 'size'> {
  value: string
  onValueChange: (value: string) => void
  /** Accessible name of the clear button. */
  clearLabel: string
  size?: InputSize
  /** Sets `aria-invalid` on the field and the error frame on the wrapper. */
  invalid?: boolean
  /** Extra inline content before the clear button, e.g. a character counter. */
  trailing?: ReactNode
  wrapperClassName?: string
}

/**
 * Search field: leading search icon, the Input atom, optional trailing
 * metadata and a clear button that also returns focus to the field.
 */
export const FilterInput = forwardRef<HTMLInputElement, FilterInputProps>(function FilterInput({
  value,
  onValueChange,
  clearLabel,
  size = 'md',
  invalid = false,
  trailing,
  wrapperClassName = '',
  className = '',
  ...props
}, ref) {
  const inputRef = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, [])

  return (
    <div
      className={`filter-input filter-input--${size}${wrapperClassName ? ` ${wrapperClassName}` : ''}`}
      data-invalid={invalid || undefined}
    >
      <SearchIcon className="filter-input-icon" />
      <Input
        ref={inputRef}
        size={size}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        aria-invalid={invalid || undefined}
        className={`filter-input-field${className ? ` ${className}` : ''}`}
        {...props}
      />
      {trailing && <span className="filter-input-trailing">{trailing}</span>}
      {value && (
        <Button
          size="xs"
          shape="icon"
          variant="neutral"
          appearance="ghost"
          onClick={() => {
            onValueChange('')
            inputRef.current?.focus()
          }}
          aria-label={clearLabel}
          title={clearLabel}
          className="filter-input-clear"
        >
          <XIcon />
        </Button>
      )}
    </div>
  )
})
