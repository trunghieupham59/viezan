import { type KeyboardEvent, useRef } from 'react'
import { Button } from '../atoms/Button'
import { CheckIcon } from '../icons'
import { nextRadioIndex } from './radioStripNavigation'
import '../../../styles/molecules.css'

export interface ThemePresetOption<T extends string> {
  value: T
  label: string
  /** Short badge on the tile, e.g. "Always dark". */
  badge?: string
}

export interface ThemePresetPickerProps<T extends string> {
  /** Accessible name for the radio group. */
  label: string
  value: T
  options: ThemePresetOption<T>[]
  onChange: (value: T) => void
  /**
   * Fired with the option under the pointer or keyboard focus, and with null
   * when it leaves, so a caller can preview a style before committing it.
   */
  onPreview?: (value: T | null) => void
}

/**
 * Horizontal strip of style tiles behaving as one radio group: arrow keys
 * move the selection, each tile paints its own swatch through `data-theme`,
 * and the selected ring uses the window's accent (captured on the strip) so
 * it reads the same on every tile.
 */
export function ThemePresetPicker<T extends string>({ label, value, options, onChange, onPreview }: ThemePresetPickerProps<T>) {
  const tileRefs = useRef<Map<T, HTMLButtonElement>>(new Map())

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = nextRadioIndex(event.key, index, options.length)
    if (next === null) return
    event.preventDefault()
    const option = options[next]
    if (!option) return
    onChange(option.value)
    tileRefs.current.get(option.value)?.focus()
  }

  return (
    <div className="theme-preset-strip" role="radiogroup" aria-label={label}>
      {options.map((option, index) => {
        const selected = option.value === value
        return (
          <Button
            key={option.value}
            ref={(node) => {
              if (node) tileRefs.current.set(option.value, node)
              else tileRefs.current.delete(option.value)
            }}
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            size="lg"
            shape="rect"
            variant="neutral"
            appearance="outline"
            className="theme-preset-tile"
            data-theme={option.value}
            data-selected={selected ? 'true' : undefined}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onMouseEnter={() => onPreview?.(option.value)}
            onMouseLeave={() => onPreview?.(null)}
            onFocus={() => onPreview?.(option.value)}
            onBlur={() => onPreview?.(null)}
          >
            <span className="theme-preset-tile-swatch" aria-hidden="true">
              <span className="theme-preset-tile-chrome">
                <span className="theme-preset-tile-nav" />
              </span>
              <span className="theme-preset-tile-canvas">
                <span className="theme-preset-tile-type">Aa</span>
                <span className="theme-preset-tile-accent" />
              </span>
            </span>
            <span className="theme-preset-tile-name">{option.label}</span>
            {option.badge ? <span className="theme-preset-tile-badge">{option.badge}</span> : null}
            {selected ? (
              <span className="theme-preset-tile-check" aria-hidden="true">
                <CheckIcon className="h-3 w-3" />
              </span>
            ) : null}
          </Button>
        )
      })}
    </div>
  )
}
