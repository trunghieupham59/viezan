import type { ReactNode } from 'react'

export interface PageHeaderProps {
  /** The page's name; always rendered as its `h1`. */
  title: string
  /** Keeps the `h1` for assistive tech but hides it when a control already names the page (e.g. a language pair). */
  titleHidden?: boolean
  /** One line under the title. */
  description?: string
  /** Page-level controls that sit right after the title (a language pair, a mode switch). */
  leading?: ReactNode
  /** Status chips, the page's one primary action and its gear, aligned to the end. */
  actions?: ReactNode
  className?: string
}

/**
 * The one header every page uses: title (and optional description), page-level
 * controls, then status and actions at the end. Layout only; content arrives
 * through props. At narrow widths the actions wrap below the title row.
 */
export function PageHeader({ title, titleHidden = false, description, leading, actions, className = '' }: PageHeaderProps) {
  return (
    <header className={`page-header${className ? ` ${className}` : ''}`}>
      {titleHidden ? (
        <h1 className="sr-only">{title}</h1>
      ) : (
        <div className="page-header__heading">
          <h1 className="page-header__title">{title}</h1>
          {description && <p className="page-header__description">{description}</p>}
        </div>
      )}
      {leading}
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  )
}
