import { type CSSProperties, type ReactNode, type RefObject, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
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
  /** `auto` opens toward the side of the trigger with more room and caps the height to it. */
  placement?: 'above' | 'below' | 'auto'
  /** Which trigger edge the panel lines up with: `end` (default) for header controls, `start` for a trigger at a surface's left edge. */
  align?: 'start' | 'end'
  /** Actions pinned under the scrolling body, e.g. Discard / Apply. */
  footer?: ReactNode
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
  align = 'end',
  footer,
  onClose,
  children,
}: AIConfigurationPopoverProps) {
  const titleId = useId()
  const scopeId = useId()
  const panelRef = useRef<HTMLElement>(null)
  // Each popover anchors to its own trigger. A shared anchor name would make every
  // popover follow whichever trigger comes last in the document.
  const anchorName = `--vzn-ai-configuration-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  useLayoutEffect(() => {
    const trigger = triggerRef.current
    if (!open || !trigger) return
    trigger.style.setProperty('anchor-name', anchorName)
    return () => {
      trigger.style.removeProperty('anchor-name')
    }
  }, [anchorName, open, triggerRef])

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

  // Auto placement: measured from the trigger when the panel opens and on resize.
  const [measured, setMeasured] = useState<{ side: 'above' | 'below'; room: number } | null>(null)
  useLayoutEffect(() => {
    if (!open || placement !== 'auto') return
    const measure = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const above = rect.top
      const below = window.innerHeight - rect.bottom
      const gap = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--vzn-space-4')) || 0
      setMeasured(above > below ? { side: 'above', room: above - gap } : { side: 'below', room: below - gap })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [open, placement, triggerRef])

  if (!open) return null

  const side = placement === 'auto' ? measured?.side ?? 'below' : placement
  const panelStyle = {
    positionAnchor: anchorName,
    ...(placement === 'auto' && measured ? { '--ai-configuration-room': `${Math.max(0, measured.room)}px` } : {}),
  } as CSSProperties

  return createPortal(
    <section
      id={id}
      ref={panelRef}
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={scopeId}
      className={`ai-configuration-popover ai-configuration-popover--${side}${align === 'start' ? ' ai-configuration-popover--start' : ''}`}
      style={panelStyle}
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
      {footer && <footer className="ai-configuration-popover__footer">{footer}</footer>}
    </section>,
    document.body,
  )
}
