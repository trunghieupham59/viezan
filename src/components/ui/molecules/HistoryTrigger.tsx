import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { Button } from '../atoms'
import { ClockIcon } from '../icons'

export interface HistoryTriggerProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children'> {
  /** Visible caption beside the clock icon. */
  label: string
  /** Number of saved entries; hidden while zero. */
  count?: number
  /** Whether the history surface (panel or dialog) is currently showing. */
  expanded: boolean
  /** Accessible name while the surface is showing; defaults to `label`. */
  hideLabel?: string
  /** Accessible name while the surface is hidden; defaults to `label`. */
  showLabel?: string
  /** `id` of the panel the trigger expands, when it is a persistent panel. */
  controlsId?: string
  /** Set when the trigger opens a modal dialog instead of an inline panel. */
  hasPopup?: 'dialog'
  onToggle: () => void
}

/**
 * The one control that opens a feature's saved-runs history.
 *
 * Every feature command bar (AI Chat, AI Translate, AI Interpret) renders the
 * same `md` neutral rect: clock icon, caption, and an entry count. It reads as
 * `outline` while the history is hidden and `soft` once it is showing, and
 * exposes that state through `aria-expanded` rather than colour alone.
 */
export const HistoryTrigger = forwardRef<HTMLButtonElement, HistoryTriggerProps>(function HistoryTrigger({
  label,
  count = 0,
  expanded,
  hideLabel,
  showLabel,
  controlsId,
  hasPopup,
  onToggle,
  className = '',
  ...props
}, ref) {
  const accessibleName = (expanded ? hideLabel : showLabel) ?? label
  return (
    <Button
      ref={ref}
      size="md"
      shape="rect"
      variant="neutral"
      appearance={expanded ? 'soft' : 'outline'}
      aria-expanded={expanded}
      aria-controls={controlsId}
      aria-haspopup={hasPopup}
      aria-label={accessibleName}
      title={accessibleName}
      onClick={onToggle}
      className={`history-trigger${className ? ` ${className}` : ''}`}
      {...props}
    >
      <ClockIcon />
      <span>{label}</span>
      {count > 0 && <span className="history-trigger-count">{count}</span>}
    </Button>
  )
})
