import type { ReactNode } from 'react'
import { Button } from '../atoms'

export interface EmptyPanelStateProps {
  icon: ReactNode
  description: string
  actionLabel?: string
  onAction?: () => void
}

/** Centered panel guidance with an optional, fully labelled primary action. */
export function EmptyPanelState({
  icon,
  description,
  actionLabel,
  onAction,
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
      <p>{description}</p>
    </div>
  )
}
