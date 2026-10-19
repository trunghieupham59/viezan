import { type KeyboardEvent, type ReactNode, useId, useRef } from 'react'
import { Button, type ButtonSize } from '../atoms'
import '../../../styles/molecules.css'

export interface TabBarTab<Id extends string = string> {
  id: Id
  label: string
  count?: number
  icon?: ReactNode
  /** `id` of the panel this tab controls. */
  panelId?: string
}

export interface TabBarProps<Id extends string = string> {
  /** Accessible name of the tab list. */
  label: string
  tabs: Array<TabBarTab<Id>>
  activeId: Id
  onChange: (id: Id) => void
  size?: Extract<ButtonSize, 'sm' | 'md'>
  className?: string
}

/**
 * Equal-width tab list with count badges. Arrow keys, Home and End move
 * between tabs and select them; only the active tab sits in the Tab order.
 */
export function TabBar<Id extends string = string>({
  label,
  tabs,
  activeId,
  onChange,
  size = 'md',
  className = '',
}: TabBarProps<Id>) {
  const baseId = useId()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const lastIndex = tabs.length - 1
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = index === lastIndex ? 0 : index + 1
    if (event.key === 'ArrowLeft') nextIndex = index === 0 ? lastIndex : index - 1
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = lastIndex
    if (nextIndex === null) return

    event.preventDefault()
    onChange(tabs[nextIndex].id)
    tabRefs.current[nextIndex]?.focus()
  }

  return (
    <div className={`tab-bar${className ? ` ${className}` : ''}`} role="tablist" aria-label={label}>
      {tabs.map((tab, index) => {
        const active = tab.id === activeId
        return (
          <Button
            key={tab.id}
            ref={(node) => { tabRefs.current[index] = node }}
            id={`${baseId}-tab-${tab.id}`}
            size={size}
            shape="rect"
            variant={active ? 'primary' : 'neutral'}
            appearance={active ? 'soft' : 'ghost'}
            role="tab"
            aria-selected={active}
            aria-controls={tab.panelId}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className="tab-bar-tab"
          >
            {tab.icon && <span className="tab-bar-icon">{tab.icon}</span>}
            <span className="tab-bar-label">{tab.label}</span>
            {tab.count !== undefined && (
              <span className="tab-bar-count" data-active={active || undefined}>{tab.count}</span>
            )}
          </Button>
        )
      })}
    </div>
  )
}
