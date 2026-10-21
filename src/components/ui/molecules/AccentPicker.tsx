import { type KeyboardEvent, useRef } from 'react'
import { Button } from '../atoms/Button'
import { CheckIcon } from '../icons'
import { nextRadioIndex } from './radioStripNavigation'
import '../../../styles/molecules.css'

export interface AccentOption<T extends string> {
  value: T
  label: string
  /** The "follow the style" option carries no `data-accent` and shows the preset's own hue. */
  auto?: boolean
}

export interface AccentPickerProps<T extends string> {
  /** Accessible name for the radio group. */
  label: string
  value: T
  options: AccentOption<T>[]
  onChange: (value: T) => void
  /** Mode the swatches are painted in, pinned through `data-mode`. */
  dark?: boolean
  /** Fired with the option under the pointer or focus, and null when it leaves. */
  onPreview?: (value: T | null) => void
}

/**
 * Row of round accent swatches behaving as one radio group. Each swatch sets
 * `data-accent` and `data-mode` on itself so its dot is painted by that
 * accent's token block, on top of the window's current style.
 */
export function AccentPicker<T extends string>({ label, value, options, onChange, dark = false, onPreview }: AccentPickerProps<T>) {
  const refs = useRef<Map<T, HTMLButtonElement>>(new Map())

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = nextRadioIndex(event.key, index, options.length)
    if (next === null) return
    event.preventDefault()
    const option = options[next]
    if (!option) return
    onChange(option.value)
    refs.current.get(option.value)?.focus()
  }

  return (
    <div className="accent-strip" role="radiogroup" aria-label={label}>
      {options.map((option, index) => {
        const selected = option.value === value
        return (
          <Button
            key={option.value}
            ref={(node) => {
              if (node) refs.current.set(option.value, node)
              else refs.current.delete(option.value)
            }}
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            title={option.label}
            tabIndex={selected ? 0 : -1}
            size="lg"
            shape="icon"
            variant="neutral"
            appearance="ghost"
            className="accent-swatch"
            data-accent={option.auto ? undefined : option.value}
            data-mode={dark ? 'dark' : 'light'}
            data-auto={option.auto ? 'true' : undefined}
            data-selected={selected ? 'true' : undefined}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onMouseEnter={() => onPreview?.(option.value)}
            onMouseLeave={() => onPreview?.(null)}
            onFocus={() => onPreview?.(option.value)}
            onBlur={() => onPreview?.(null)}
          >
            <span className="accent-swatch-dot" aria-hidden="true">
              {selected ? <CheckIcon className="h-3 w-3" /> : null}
            </span>
          </Button>
        )
      })}
    </div>
  )
}
