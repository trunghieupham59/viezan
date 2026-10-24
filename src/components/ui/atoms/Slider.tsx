import { type ChangeEvent, type CSSProperties, type InputHTMLAttributes, useCallback } from 'react'

export interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'min' | 'max' | 'step' | 'onChange'> {
  value: number
  min: number
  max: number
  step?: number
  /** Fires on every movement; use it to show the pending value. */
  onChange: (value: number) => void
  /** Fires once the user lets go (pointer up, key up); use it to commit. */
  onCommit?: (value: number) => void
}

/**
 * Native range input styled with the app's control tokens. The filled part of the
 * track follows the value through the `--ui-slider-progress` custom property, so the
 * stylesheet holds every colour and size.
 */
export function Slider({ value, min, max, step = 1, onChange, onCommit, className = '', disabled, style, ...rest }: SliderProps) {
  const span = max - min
  const progress = span > 0 ? Math.max(0, Math.min(100, ((value - min) / span) * 100)) : 0
  const read = (event: { currentTarget: HTMLInputElement }) => Number(event.currentTarget.value)
  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => onChange(Number(event.currentTarget.value)), [onChange])
  const commit = onCommit ? (event: { currentTarget: HTMLInputElement }) => onCommit(read(event)) : undefined
  const mergedStyle = { ...style, '--ui-slider-progress': `${progress}%` } as CSSProperties

  return (
    <input
      {...rest}
      type="range"
      className={`ui-slider${className ? ` ${className}` : ''}`}
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      style={mergedStyle}
      onChange={handleChange}
      onPointerUp={commit}
      onKeyUp={commit}
      onBlur={commit}
    />
  )
}
