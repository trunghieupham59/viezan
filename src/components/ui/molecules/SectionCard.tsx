import { type ReactNode, useId } from 'react'
import { Button } from '../atoms'
import '../../../styles/molecules.css'

export interface SectionCardProps {
  title: string
  /** One line beside the title (list cards) or under it. */
  description?: string
  /** A quiet link-like action at the end of the header ("Open", "Edit"). */
  actionLabel?: string
  onAction?: () => void
  /** Something to show at the header end instead of an action, e.g. a status. */
  status?: ReactNode
  /** `list` puts the header on its own divided row and lets rows run edge to edge. */
  variant?: 'padded' | 'list'
  children: ReactNode
  className?: string
}

/**
 * A rounded surface with a small heading row and free content: the building
 * block of overview pages such as Home. The section is a landmark named by its
 * heading.
 */
export function SectionCard({ title, description, actionLabel, onAction, status, variant = 'padded', children, className = '' }: SectionCardProps) {
  const headingId = useId()
  return (
    <section className={`ui-section-card${className ? ` ${className}` : ''}`} data-variant={variant} aria-labelledby={headingId}>
      <header className="ui-section-card__header">
        <h2 id={headingId} className="ui-section-card__title">{title}</h2>
        {description && <p className="ui-section-card__description">{description}</p>}
        {status}
        {actionLabel && onAction && (
          <Button size="xs" variant="primary" appearance="ghost" className="ui-section-card__action" onClick={onAction}>{actionLabel}</Button>
        )}
      </header>
      {children}
    </section>
  )
}
