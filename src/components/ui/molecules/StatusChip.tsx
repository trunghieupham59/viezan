import type { ReactNode } from 'react'
import { StatusDot, type StatusTone } from '../atoms'

export interface StatusChipProps {
  tone?: StatusTone
  children: ReactNode
  /** Replaces the dot, e.g. a spinner while something is starting. */
  icon?: ReactNode
  /** Longer explanation on hover, e.g. the full error text. */
  title?: string
  className?: string
}

/**
 * A compact rounded label for a background state ("Helper connected", "Running"):
 * a dot in the state's colour, or an icon, plus short text that carries the meaning.
 */
export function StatusChip({ tone = 'neutral', children, icon, title, className = '' }: StatusChipProps) {
  return (
    <span className={`ui-status-chip${className ? ` ${className}` : ''}`} data-tone={tone} title={title}>
      {icon ? <span className="ui-status-chip__icon" aria-hidden="true">{icon}</span> : <StatusDot tone={tone} />}
      <span className="ui-status-chip__text">{children}</span>
    </span>
  )
}
