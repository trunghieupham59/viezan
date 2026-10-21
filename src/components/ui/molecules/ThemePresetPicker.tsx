import { Button } from '../atoms/Button'
import '../../../styles/molecules.css'

export interface ThemePresetOption<T extends string> {
  value: T
  label: string
  description?: string
}

export interface ThemePresetPickerProps<T extends string> {
  /** Accessible name for the whole group. */
  label: string
  value: T
  options: ThemePresetOption<T>[]
  onChange: (value: T) => void
}

/**
 * Palette preset chooser. Each card sets `data-theme` on itself so the
 * swatches are painted by that preset's own tokens, in the current
 * light/dark mode, without a second copy of the colours in TypeScript.
 */
export function ThemePresetPicker<T extends string>({ label, value, options, onChange }: ThemePresetPickerProps<T>) {
  return (
    <fieldset className="theme-preset-picker">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <Button
            key={option.value}
            size="lg"
            shape="rect"
            variant={selected ? 'primary' : 'neutral'}
            appearance={selected ? 'soft' : 'outline'}
            className="theme-preset-card"
            data-theme={option.value}
            data-selected={selected ? 'true' : undefined}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
          >
            <span className="theme-preset-swatch" aria-hidden="true">
              <span className="theme-preset-swatch-chrome" />
              <span className="theme-preset-swatch-canvas">
                <span className="theme-preset-swatch-accent" />
                <span className="theme-preset-swatch-line" />
              </span>
            </span>
            <span className="theme-preset-copy">
              <span className="theme-preset-title">{option.label}</span>
              {option.description ? <span className="theme-preset-description">{option.description}</span> : null}
            </span>
          </Button>
        )
      })}
    </fieldset>
  )
}
