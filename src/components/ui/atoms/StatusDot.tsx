import type { HTMLAttributes } from 'react'

export type StatusTone = 'ok' | 'warning' | 'danger' | 'info' | 'neutral'

export interface StatusDotProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  tone?: StatusTone
  /**
   * Spoken status when the dot stands alone (e.g. a collapsed navigation rail).
   * Leave it out when visible text next to the dot already says the same thing:
   * the dot is then decorative and hidden from assistive tech.
   */
  label?: string
}

/**
 * Small round status indicator in the semantic feedback colours. Colour is never
 * the only signal: pair it with text, or give it a `label`.
 */
export function StatusDot({ tone = 'neutral', label, className = '', ...rest }: StatusDotProps) {
  return (
    <span
      {...rest}
      className={`ui-status-dot${className ? ` ${className}` : ''}`}
      data-tone={tone}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    />
  )
}
