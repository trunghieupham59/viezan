import { Button } from './atoms'
/**
 * ButtonGroup — generic "pick one from a set" button row.
 *
 * Renders a row of buttons where the selected value is highlighted
 * with the neutral app accent. Used by FontSizePicker and TokenTtlPicker (and any future
 * single-selection option group).
 *
 * @example
 * <ButtonGroup
 *   value={fontSize}
 *   onChange={setFontSize}
 *   options={[
 *     { value: 'small',  label: 'S' },
 *     { value: 'medium', label: 'M' },
 *     { value: 'large',  label: 'L' },
 *   ]}
 * />
 */

export interface ButtonGroupOption<T extends string | number> {
  value: T
  label: string
}

interface ButtonGroupProps<T extends string | number> {
  value: T
  onChange: (value: T) => void
  options: ButtonGroupOption<T>[]
  /** Extra Tailwind classes for the container `<div>`. */
  containerClassName?: string
  /** Disables every option, e.g. while a style pins the value. */
  disabled?: boolean
}

export function ButtonGroup<T extends string | number>({
  value,
  onChange,
  options,
  containerClassName = '',
  disabled = false,
}: ButtonGroupProps<T>) {
  return (
    <div className={`segmented-control ${containerClassName}`}>
      {options.map((opt) => (
        <Button
          size="md"
          shape="rect"
          variant={value === opt.value ? 'primary' : 'neutral'}
          appearance={value === opt.value ? 'soft' : 'ghost'}
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  )
}
