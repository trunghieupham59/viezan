import { KeyCap } from '../atoms'
import { StatusChip } from './StatusChip'
import '../../../styles/molecules.css'

export interface ShortcutListItem {
  id: string
  label: string
  /** Where it works ("System-wide", "In the window") and any hint. */
  scope: string
  /** Key labels in order, e.g. ['Cmd', 'K']; empty when none is set. */
  keys: readonly string[]
  /** Listed but turned off: shown muted, never flagged as a conflict. */
  inactive?: boolean
  /** Shares its keys with another active shortcut. */
  conflict?: boolean
}

export interface ShortcutListProps {
  items: readonly ShortcutListItem[]
  /** Shown next to a conflicting row; carries the meaning, not only colour. */
  conflictLabel: string
  /** Shown instead of keys when a shortcut has none set. */
  unsetLabel: string
  /** Shown for an inactive shortcut. */
  offLabel: string
  label: string
  /** One line per shortcut (name and keys), as on Home. */
  compact?: boolean
}

/** Every shortcut in one read-only list, so collisions are visible at a glance. */
export function ShortcutList({ items, conflictLabel, unsetLabel, offLabel, label, compact = false }: ShortcutListProps) {
  return (
    <ul className="ui-shortcut-list" data-compact={compact || undefined} aria-label={label}>
      {items.map((item) => (
        <li
          key={item.id}
          className="ui-shortcut-list__row"
          data-conflict={item.conflict || undefined}
          data-inactive={item.inactive || undefined}
        >
          <span className="ui-shortcut-list__copy">
            <span className="ui-shortcut-list__label">
              {item.label}
              {/* Compact rows drop the scope line, so "off" is said in text here rather than only by fading. */}
              {compact && item.inactive && <span className="ui-shortcut-list__scope">{` · ${offLabel}`}</span>}
            </span>
            {!compact && <span className="ui-shortcut-list__scope">{item.inactive ? `${item.scope} · ${offLabel}` : item.scope}</span>}
          </span>
          {item.conflict && <StatusChip tone="warning">{conflictLabel}</StatusChip>}
          <span className="ui-shortcut-list__keys">
            {item.keys.length > 0
              ? <KeyCap>{item.keys.join(' ')}</KeyCap>
              : <span className="ui-shortcut-list__unset">{unsetLabel}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}
