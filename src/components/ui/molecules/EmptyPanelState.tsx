import type { ReactNode } from 'react'
import { Button } from '../atoms'

export interface EmptyPanelStateProps {
  icon: ReactNode
  description: string
  /** Optional heading shown above the description. */
  title?: string
  actionLabel?: string
  onAction?: () => void
  /** Extra guidance rendered under the description, e.g. example chips. */
  children?: ReactNode
}

/** Centered panel guidance with an optional, fully labelled primary action. */
export function EmptyPanelState({
  icon,
  description,
  title,
  actionLabel,
  onAction,
  children,
}: EmptyPanelStateProps) {
  return (
    <div className="empty-panel-state">
      {onAction && actionLabel ? (
        <Button
          size="lg"
          shape="icon"
          variant="primary"
          appearance="soft"
          onClick={onAction}
          aria-label={actionLabel}
          className="empty-panel-state-action"
        >
          {icon}
        </Button>
      ) : (
        <span className="empty-panel-state-icon" aria-hidden="true">{icon}</span>
      )}
      {title && <h2 className="empty-panel-state-title">{title}</h2>}
      <p>{description}</p>
      {children}
    </div>
  )
}
