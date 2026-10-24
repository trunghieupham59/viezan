import { type KeyboardEvent, useEffect, useId, useState } from 'react'
import { Input, Slider } from '../atoms'

export interface SliderFieldProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  /** Short unit shown after the number box, e.g. "°C" or "RPM". */
  unit?: string
  /** Fires on every slider movement with the pending value (for live previews). */
  onChange?: (value: number) => void
  /** Fires once with the final value: slider released, or the number box left / Enter pressed. */
  onCommit: (value: number) => void
  disabled?: boolean
  className?: string
}

/** Clamp into the range and snap to the step so the box and the slider agree. */
export function snapToRange(raw: number, min: number, max: number, step: number): number {
  if (!Number.isFinite(raw)) return min
  const snapped = Math.round(raw / step) * step
  return Math.max(min, Math.min(max, snapped))
}

/**
 * A value you can both drag and type: a label, a number box with its unit, and a
 * slider underneath. Typing commits on Enter or when the box is left; dragging
 * commits on release. Out-of-range or off-step input is corrected, not refused.
 */
export function SliderField({ label, value, min, max, step = 1, unit, onChange, onCommit, disabled = false, className = '' }: SliderFieldProps) {
  const id = useId()
  const [pending, setPending] = useState(value)
  const [text, setText] = useState(String(value))
  // Follow the committed value unless the user is mid-edit (then the local state differs by design).
  useEffect(() => { setPending(value); setText(String(value)) }, [value])

  const move = (next: number) => {
    setPending(next)
    setText(String(next))
    onChange?.(next)
  }
  const commit = (raw: number) => {
    const next = snapToRange(raw, min, max, step)
    setPending(next)
    setText(String(next))
    if (next !== value) onCommit(next)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit(Number(text))
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setText(String(value))
      setPending(value)
    }
  }

  return (
    <div className={`slider-field${className ? ` ${className}` : ''}`}>
      <div className="slider-field__head">
        <label htmlFor={`${id}-number`} className="slider-field__label">{label}</label>
        <span className="slider-field__entry">
          <Input
            id={`${id}-number`}
            size="sm"
            type="number"
            inputMode="decimal"
            className="slider-field__number"
            value={text}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onChange={(event) => setText(event.currentTarget.value)}
            onBlur={() => commit(Number(text))}
            onKeyDown={onKeyDown}
          />
          {unit && <span className="slider-field__unit" aria-hidden="true">{unit}</span>}
        </span>
      </div>
      <Slider
        aria-label={label}
        value={pending}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={move}
        onCommit={commit}
      />
    </div>
  )
}
