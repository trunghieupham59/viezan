import type { ReactNode } from 'react'
import { StatusDot, type StatusTone } from '../atoms'
import '../../../styles/molecules.css'

export interface StatusLabelProps {
  tone?: StatusTone
  children: ReactNode
}

/** A state as a coloured dot and short text ("Connected", "No key"), without a chip. */
export function StatusLabel({ tone = 'neutral', children }: StatusLabelProps) {
  return (
    <span className="ui-status-label" data-tone={tone}>
      <StatusDot tone={tone} />
      <span>{children}</span>
    </span>
  )
}
