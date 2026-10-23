import type { ReactNode } from 'react'
import { Button, type ButtonProps } from '../atoms'

export type CapabilityNoticeTone = 'info' | 'ok' | 'warning' | 'danger'

export interface CapabilityNoticeAction {
  label: string
  onClick: () => void
  /** The one action the user is expected to take renders solid; others outline. */
  primary?: boolean
  variant?: ButtonProps['variant']
  disabled?: boolean
}

export interface CapabilityNoticeProps {
  title: ReactNode
  description?: ReactNode
  tone?: CapabilityNoticeTone
  /** Up to a few actions; none for a purely informative row (e.g. "permission granted"). */
  actions?: readonly CapabilityNoticeAction[]
  className?: string
}

/**
 * One row that explains a system capability or permission and offers the way to
 * fix it: a title, a short description and optional actions. Used by every feature
 * that depends on something the OS must allow (Accessibility, system shortcuts, ...),
 * so those rows look and behave the same everywhere.
 */
export function CapabilityNotice({ title, description, tone = 'info', actions = [], className = '' }: CapabilityNoticeProps) {
  const inline = actions.length === 1
  return (
    <div
      role="status"
      data-tone={tone}
      className={`capability-notice${inline ? ' capability-notice--inline' : ''}${className ? ` ${className}` : ''}`}
    >
      <div className="capability-notice__copy">
        <p className="capability-notice__title">{title}</p>
        {description && <p className="capability-notice__description">{description}</p>}
      </div>
      {actions.length > 0 && (
        <div className="capability-notice__actions">
          {actions.map((action) => (
            <Button
              key={action.label}
              size="md"
              shape="rect"
              type="button"
              variant={action.variant ?? (action.primary ? 'primary' : 'neutral')}
              appearance={action.primary ? 'solid' : 'outline'}
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
