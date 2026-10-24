import { type KeyboardEvent, useEffect, useId, useState } from 'react'
import { Input } from '../atoms'
import { snapToRange } from './SliderField'

export interface NumberFieldProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  /** Short unit after the box, e.g. "°C". */
  unit?: string
  /** Fires once with the corrected value on Enter or when the box is left; not when nothing changed. */
  onCommit: (value: number) => void
  disabled?: boolean
  className?: string
}

/**
 * A labelled number box for a bounded value. Typing commits on Enter or blur;
 * out-of-range or off-step input is corrected, not refused; Escape restores.
 */
export function NumberField({ label, value, min, max, step = 1, unit, onCommit, disabled = false, className = '' }: NumberFieldProps) {
  const id = useId()
  const [text, setText] = useState(String(value))
  useEffect(() => { setText(String(value)) }, [value])

  const commit = () => {
    const next = snapToRange(Number(text), min, max, step)
    setText(String(next))
    if (next !== value) onCommit(next)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setText(String(value))
    }
  }

  return (
    <div className={`number-field${className ? ` ${className}` : ''}`}>
      <label htmlFor={id} className="number-field__label">{label}</label>
      <span className="number-field__entry">
        <Input
          id={id}
          size="sm"
          type="number"
          inputMode="decimal"
          className="number-field__input"
          value={text}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(event) => setText(event.currentTarget.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
        {unit && <span className="number-field__unit" aria-hidden="true">{unit}</span>}
      </span>
    </div>
  )
}
