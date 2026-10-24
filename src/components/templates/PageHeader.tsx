import { forwardRef, type ReactNode } from 'react'

export interface PageHeaderProps {
  /** The page's name; always rendered as its `h1`. */
  title: string
  /** Id for the `h1`, when a region elsewhere is labelled by the page title. */
  titleId?: string
  /** Keeps the `h1` for assistive tech but hides it when a control already names the page (e.g. a language pair). */
  titleHidden?: boolean
  /** One line under the title. */
  description?: string
  /** A control before the title that shows or hides the page's own side panel (e.g. AI Chat history). */
  start?: ReactNode
  /** Page-level controls that sit right after the title (a language pair, a mode switch). */
  leading?: ReactNode
  /** Status chips, the page's one primary action and its gear, aligned to the end. */
  actions?: ReactNode
  className?: string
}

/**
 * The one header every page uses: an optional panel toggle, the title (and
 * optional description), page-level controls, then status and actions at the
 * end. Layout only; content arrives through props. A long title truncates
 * with its full text on hover. At narrow widths the actions wrap below the
 * title row.
 */
export const PageHeader = forwardRef<HTMLElement, PageHeaderProps>(function PageHeader(
  { title, titleId, titleHidden = false, description, start, leading, actions, className = '' },
  ref,
) {
  return (
    <header ref={ref} className={`page-header${className ? ` ${className}` : ''}`}>
      {start}
      {titleHidden ? (
        <h1 id={titleId} className="sr-only">{title}</h1>
      ) : (
        <div className="page-header__heading">
          <h1 id={titleId} className="page-header__title" title={title}>{title}</h1>
          {description && <p className="page-header__description">{description}</p>}
        </div>
      )}
      {leading}
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  )
})
