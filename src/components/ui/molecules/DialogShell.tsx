import { type ReactNode, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { trapTabFocus } from '../../../utils/focusTrap'
import { Button } from '../atoms'
import { XIcon } from '../icons'
import '../../../styles/molecules.css'

export type DialogShellSize = 'sm' | 'md' | 'lg'

export interface DialogShellProps {
  /** Accessible name of the dialog; the visible `title` may be richer than a plain string. */
  label: string
  title: ReactNode
  subtitle?: ReactNode
  closeLabel: string
  onClose: () => void
  /** Test hook for the full-surface backdrop button. */
  backdropTestId?: string
  size?: DialogShellSize
  /** Optional action row pinned below the scrolling body. */
  footer?: ReactNode
  children: ReactNode
}

/**
 * Modal frame shared by pop-ups: scrim + backdrop button, labelled dialog,
 * header with title/subtitle/close, a scrolling body and an optional footer.
 * The shell owns Escape, focus trapping and returning focus to the opener.
 *
 * The backdrop is a deliberate native `<button>`: a pointer-only, full-surface
 * dismiss target that duplicates the labelled close button, so it is hidden
 * from assistive technology and never receives Tab focus.
 */
export function DialogShell({
  label,
  title,
  subtitle,
  closeLabel,
  onClose,
  backdropTestId,
  size = 'md',
  footer,
  children,
}: DialogShellProps) {
  const subtitleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      trapTabFocus(event, dialogRef.current)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [])

  return createPortal(
    <div className="dialog-shell-layer">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        data-testid={backdropTestId}
        onClick={onClose}
        className="dialog-shell-backdrop"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-describedby={subtitle ? subtitleId : undefined}
        className={`dialog-shell dialog-shell--${size}`}
      >
        <header className="dialog-shell-header">
          <div className="dialog-shell-heading">
            <h2 className="dialog-shell-title">{title}</h2>
            {subtitle && <p id={subtitleId} className="dialog-shell-subtitle">{subtitle}</p>}
          </div>
          <Button
            ref={closeButtonRef}
            size="sm"
            shape="icon"
            variant="neutral"
            appearance="ghost"
            onClick={onClose}
            title={closeLabel}
            aria-label={closeLabel}
            className="dialog-shell-close"
          >
            <XIcon />
          </Button>
        </header>
        <div className="dialog-shell-body">{children}</div>
        {footer && <footer className="dialog-shell-footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
