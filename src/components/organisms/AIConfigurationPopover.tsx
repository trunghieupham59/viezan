import { type ReactNode, type RefObject, useCallback, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../ui/atoms'
import { XIcon } from '../ui/icons'

export interface AIConfigurationPopoverProps {
  id?: string
  open: boolean
  title: string
  scopeDescription: string
  closeLabel: string
  triggerRef: RefObject<HTMLElement | null>
  placement?: 'above' | 'below'
  onClose: () => void
  children: ReactNode
}

export function AIConfigurationPopover({
  id,
  open,
  title,
  scopeDescription,
  closeLabel,
  triggerRef,
  placement = 'below',
  onClose,
  children,
}: AIConfigurationPopoverProps) {
  const titleId = useId()
  const scopeId = useId()
  const panelRef = useRef<HTMLElement>(null)

  const closeAndRestoreFocus = useCallback(() => {
    onClose()
    requestAnimationFrame(() => triggerRef.current?.focus())
  }, [onClose, triggerRef])

  useEffect(() => {
    if (!open) return
    const focusFrame = requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>('.ai-configuration-popover__body')
        ?.querySelector<HTMLElement>(
        '[data-ai-config-autofocus], input:not(:disabled), select:not(:disabled), button:not(:disabled)',
      )?.focus()
    })
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeAndRestoreFocus()
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [closeAndRestoreFocus, onClose, open, triggerRef])

  if (!open) return null

  return createPortal(
    <section
      id={id}
      ref={panelRef}
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={scopeId}
      className={`ai-configuration-popover ai-configuration-popover--${placement}`}
    >
      <header className="ai-configuration-popover__header">
        <div className="ai-configuration-popover__heading">
          <h2 id={titleId} className="ai-configuration-popover__title">{title}</h2>
          <p id={scopeId} className="ai-configuration-popover__scope">{scopeDescription}</p>
        </div>
        <Button
          size="sm"
          shape="icon"
          variant="neutral"
          appearance="ghost"
          aria-label={closeLabel}
          onClick={closeAndRestoreFocus}
        >
          <XIcon />
        </Button>
      </header>
      <div className="ai-configuration-popover__body">{children}</div>
    </section>,
    document.body,
  )
}
