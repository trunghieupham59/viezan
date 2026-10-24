import type { ReactNode } from 'react'
import { Button } from '../atoms'
import '../../../styles/molecules.css'

export interface ActivityRowProps {
  /** Optional leading icon; the kind tag already names the item. */
  icon?: ReactNode
  /** What kind of thing this is ("Chat", "Translation"), shown as a tag. */
  kind: string
  title: string
  /** Short detail after the title ("EN → JA", "with summary"). */
  meta?: string
  timeLabel?: string
  /** A call to action for items waiting on the user ("Resume"), shown instead of the time. */
  actionLabel?: string
  onOpen: () => void
}

/**
 * One recent item that reopens where the user left off. The whole row is a
 * single button so it reads as one target; its accessible name is the visible
 * text in order.
 */
export function ActivityRow({ icon, kind, title, meta, timeLabel, actionLabel, onOpen }: ActivityRowProps) {
  return (
    <Button
      size="lg"
      shape="rect"
      variant="neutral"
      appearance="ghost"
      className="ui-activity-row"
      data-pending={actionLabel ? 'true' : undefined}
      onClick={onOpen}
    >
      {icon && <span className="ui-activity-row__icon" aria-hidden="true">{icon}</span>}
      <span className="ui-activity-row__kind">{kind}</span>
      <span className="ui-activity-row__body">
        <span className="ui-activity-row__title">{title}</span>
        {meta && <span className="ui-activity-row__meta">· {meta}</span>}
      </span>
      {actionLabel
        ? <span className="ui-activity-row__action">{actionLabel}</span>
        : timeLabel && <span className="ui-activity-row__time">{timeLabel}</span>}
    </Button>
  )
}
