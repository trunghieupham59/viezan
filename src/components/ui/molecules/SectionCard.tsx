import { type ReactNode, useId } from 'react'
import { Button } from '../atoms'
import '../../../styles/molecules.css'

export interface SectionCardProps {
  title: string
  /** One line under the title. */
  description?: string
  /** A quiet link-like action at the end of the header ("Open", "Edit"). */
  actionLabel?: string
  onAction?: () => void
  children: ReactNode
  className?: string
}

/**
 * A rounded surface with a small heading row and free content: the building
 * block of overview pages such as Home. The section is a landmark named by its
 * heading.
 */
export function SectionCard({ title, description, actionLabel, onAction, children, className = '' }: SectionCardProps) {
  const headingId = useId()
  return (
    <section className={`ui-section-card${className ? ` ${className}` : ''}`} aria-labelledby={headingId}>
      <header className="ui-section-card__header">
        <div className="ui-section-card__heading">
          <h2 id={headingId} className="ui-section-card__title">{title}</h2>
          {description && <p className="ui-section-card__description">{description}</p>}
        </div>
        {actionLabel && onAction && (
          <Button size="sm" variant="neutral" appearance="ghost" onClick={onAction}>{actionLabel}</Button>
        )}
      </header>
      {children}
    </section>
  )
}
