import type { ReactNode } from 'react'
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
  selected: boolean
  disabled?: boolean
  onSelect: () => void
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
  selected,
  disabled = false,
  onSelect,
  onActivate,
}: LauncherResultRowProps) {
  return (
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
      onMouseEnter={onSelect}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onActivate}
    >
      {icon}
      <span className="launcher-result-name">{label}</span>
      {detail && <span className="launcher-result-detail">{detail}</span>}
      <span className="launcher-result-kind">{kindLabel}</span>
    </Button>
  )
}
