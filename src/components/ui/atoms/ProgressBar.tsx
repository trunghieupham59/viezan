import type { CSSProperties } from 'react'

export interface ProgressBarProps {
  /** Accessible name, e.g. "Sensor detection". */
  label: string
  /** Progress from 0 to `max`; leave it out for work of unknown length. */
  value?: number
  max?: number
  /** Spoken progress, e.g. "Right fan, 24 s left"; defaults to the number. */
  valueText?: string
  className?: string
}

/**
 * A thin determinate or indeterminate progress track. The fill width travels
 * through `--ui-progress`, so the stylesheet holds every colour and size.
 */
export function ProgressBar({ label, value, max = 100, valueText, className = '' }: ProgressBarProps) {
  const determinate = value !== undefined
  const ratio = determinate && max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  const style = determinate ? ({ '--ui-progress': `${Math.round(ratio * 100)}%` } as CSSProperties) : undefined
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={determinate ? Math.max(0, Math.min(max, value)) : undefined}
      aria-valuetext={valueText}
      className={`ui-progress${className ? ` ${className}` : ''}`}
      data-indeterminate={determinate ? undefined : true}
      style={style}
    >
      <span className="ui-progress__fill" />
    </div>
  )
}
