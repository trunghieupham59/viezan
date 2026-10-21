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
 * miniature window inside it (title bar, primary chrome with an active nav
 * item, canvas, reading type sample, surface card and accent action) is
 * painted by that preset's own tokens, in the current light/dark mode,
 * without a second copy of the design in TypeScript.
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
              <span className="theme-preset-swatch-titlebar" />
              <span className="theme-preset-swatch-chrome">
                <span className="theme-preset-swatch-nav theme-preset-swatch-nav-active" />
                <span className="theme-preset-swatch-nav" />
                <span className="theme-preset-swatch-nav" />
              </span>
              <span className="theme-preset-swatch-canvas">
                <span className="theme-preset-swatch-type">Aa</span>
                <span className="theme-preset-swatch-card">
                  <span className="theme-preset-swatch-line" />
                  <span className="theme-preset-swatch-action" />
                </span>
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
