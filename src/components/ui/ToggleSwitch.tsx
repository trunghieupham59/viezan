/**
 * Reusable toggle switch (pill-style) used throughout Settings.
 * Replaces 6+ copies of the same inline button pattern.
 *
 * Usage:
 *   <ToggleSwitch checked={autoTranslate} onChange={setAutoTranslate} />
 */
interface ToggleSwitchProps {
  checked: boolean
  onChange: (value: boolean) => void
  /** Aria label for accessibility */
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  disabled?: boolean
  className?: string
}

export function ToggleSwitch({
  checked,
  onChange,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  disabled = false,
  className = '',
}: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'toggle-switch-track relative inline-flex flex-shrink-0 items-center w-9 h-5 rounded-full',
        'transition-colors duration-200 focus-visible:outline-none',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        checked ? 'toggle-switch-track-on' : 'toggle-switch-track-off',
        className,
      ].join(' ')}
    >
      <span
        className={[
          'toggle-switch-thumb absolute w-4 h-4 rounded-full shadow transition-transform duration-200',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5',
        ].join(' ')}
      />
    </button>
  )
}
