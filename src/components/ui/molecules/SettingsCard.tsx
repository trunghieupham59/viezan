import { type ReactNode, useId } from 'react'
import '../../../styles/molecules.css'

export interface SettingsCardProps {
  title: string
  description?: ReactNode
  /** The header's end: the card's master switch, a status, or one action. */
  aside?: ReactNode
  /** The heading level inside the page; section cards under a page section use h3. */
  headingLevel?: 2 | 3
  children?: ReactNode
  className?: string
}

/**
 * A settings card: a header (title, one line of description, an optional
 * switch / status / action at the end) above divided rows. The card is a
 * landmark named by its heading.
 */
export function SettingsCard({ title, description, aside, headingLevel = 3, children, className = '' }: SettingsCardProps) {
  const headingId = useId()
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  return (
    <section className={`ui-settings-card${className ? ` ${className}` : ''}`} aria-labelledby={headingId}>
      <header className="ui-settings-card__header">
        <div className="ui-settings-card__heading">
          <Heading id={headingId} className="ui-settings-card__title">{title}</Heading>
          {description && <p className="ui-settings-card__description">{description}</p>}
        </div>
        {aside && <div className="ui-settings-card__aside">{aside}</div>}
      </header>
      {children}
    </section>
  )
}
