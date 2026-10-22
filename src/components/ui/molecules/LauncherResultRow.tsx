import type { MouseEvent, ReactNode } from 'react'
import { Button } from '../atoms'
import '../../../styles/molecules.css'

/** `app` wraps a real application icon; the colour tones back a letter fallback. */
export type LauncherIconTone = 'neutral' | 'app' | 'blue' | 'violet' | 'green' | 'orange'

export interface LauncherIconTileProps {
  tone?: LauncherIconTone
  children: ReactNode
  className?: string
}

/** Square icon slot so app icons, letter fallbacks and command glyphs align. */
export function LauncherIconTile({ tone = 'neutral', children, className = '' }: LauncherIconTileProps) {
  return (
    <span className={`launcher-icon-tile${className ? ` ${className}` : ''}`} data-tone={tone} aria-hidden="true">
      {children}
    </span>
  )
}

export interface LauncherResultRowProps {
  id: string
  icon: ReactNode
  label: string
  /** Secondary text after the label, e.g. the query the command will use. */
  detail?: string
  /** Right-aligned category text: Application / Command. */
  kindLabel: string
  /**
   * A control shown after the option, outside it, e.g. a currency picker. It
   * replaces the visible category text; `kindLabel` still names the option.
   */
  accessory?: ReactNode
  selected: boolean
  disabled?: boolean
  /**
   * Called while the pointer moves over the row. Movement, not entry, drives
   * selection so a row that appears under a resting pointer (after a menu
   * closes or the list re-renders) is not selected by a synthetic event.
   */
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void
  onActivate: () => void
}

/**
 * One launcher result inside a listbox. Selection is neutral so colour never
 * competes with the row content; the parent owns keyboard navigation.
 */
export function LauncherResultRow({
  id,
  icon,
  label,
  detail,
  kindLabel,
  accessory,
  selected,
  disabled = false,
  onSelect,
  onActivate,
}: LauncherResultRowProps) {
  const option = (
    <Button
      id={id}
      role="option"
      aria-label={`${label} ${kindLabel}`}
      aria-selected={selected}
      tabIndex={-1}
      disabled={disabled}
      size="lg"
      shape="rect"
      variant="neutral"
      appearance={selected ? 'soft' : 'ghost'}
      className="launcher-result"
      onMouseMove={onSelect}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onActivate}
    >
      {icon}
      <span className="launcher-result-name">{label}</span>
      {detail && <span className="launcher-result-detail">{detail}</span>}
      {!accessory && <span className="launcher-result-kind">{kindLabel}</span>}
    </Button>
  )
  if (!accessory) return option
  // Interactive content cannot nest inside the option button; the accessory sits beside it.
  return (
    <div className="launcher-result-line">
      {option}
      <div className="launcher-result-accessory">{accessory}</div>
    </div>
  )
}
