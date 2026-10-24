import type { CSSProperties } from 'react'

export interface MeterMarker {
  value: number
  /** Tooltip for the marker, e.g. "Target 2,300 RPM". */
  title: string
}

export interface MeterProps {
  value: number
  min: number
  max: number
  /** Accessible name, e.g. the fan's name. */
  label: string
  /** Spoken value, e.g. "2,374 RPM"; defaults to the number. */
  valueText?: string
  /** A second value drawn as a tick on the track (a target, a threshold). */
  marker?: MeterMarker
  /** `action` fills with the accent while the app is in control; `neutral` otherwise. */
  emphasis?: 'neutral' | 'action'
  className?: string
}

function percent(value: number, min: number, max: number): number {
  const span = max - min
  if (span <= 0) return 0
  return Math.max(0, Math.min(100, ((value - min) / span) * 100))
}

/**
 * A reading between two bounds on a thin track: a native `<meter>` (so assistive
 * tech announces it as a gauge) restyled flat, plus an optional marker tick. The
 * marker position travels through `--ui-meter-marker`, so the stylesheet holds
 * every colour and size.
 */
export function Meter({ value, min, max, label, valueText, marker, emphasis = 'neutral', className = '' }: MeterProps) {
  const clamped = Math.max(min, Math.min(max, value))
  const markerStyle = marker ? ({ '--ui-meter-marker': `${percent(marker.value, min, max)}%` } as CSSProperties) : undefined
  return (
    <span className={`ui-meter${className ? ` ${className}` : ''}`} data-emphasis={emphasis}>
      <meter className="ui-meter__gauge" aria-label={label} min={min} max={max} value={clamped} aria-valuetext={valueText} />
      {marker && <span className="ui-meter__marker" style={markerStyle} title={marker.title} aria-hidden="true" />}
    </span>
  )
}
