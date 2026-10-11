import type { ElementType } from 'react'
import { Button } from '../ui/atoms'

export interface SettingsNavigationItem<Id extends string = string> {
  id: Id
  label: string
  description: string
  Icon: ElementType<{ className?: string }>
}

export interface SettingsNavigationProps<Id extends string = string> {
  items: SettingsNavigationItem<Id>[]
  activeId: Id
  label: string
  mode: 'sidebar' | 'tabs'
  onSelect: (id: Id) => void
}

/** Responsive settings navigation. Section scrolling and focus stay in the page. */
export function SettingsNavigation<Id extends string>({
  items,
  activeId,
  label,
  mode,
  onSelect,
}: SettingsNavigationProps<Id>) {
  return (
    <nav
      className={mode === 'sidebar'
        ? 'flex-1 overflow-auto p-2.5'
        : 'overflow-x-auto px-3 py-2'}
      aria-label={label}
    >
      <div className={mode === 'sidebar' ? 'flex flex-col gap-0.5' : 'flex gap-1'}>
        {items.map(({ id, label: itemLabel, description, Icon }) => {
          const active = activeId === id
          return (
            <Button
              key={id}
              size="md"
              shape="rect"
              variant={active ? 'primary' : 'neutral'}
              appearance={active ? 'soft' : 'ghost'}
              onClick={() => onSelect(id)}
              title={description}
              className={mode === 'sidebar'
                ? 'btn-nav-item w-full justify-start gap-2.5 text-left'
                : 'whitespace-nowrap gap-1.5'}
              aria-current={active ? 'true' : undefined}
            >
              <Icon className={mode === 'sidebar' ? 'w-4 h-4 flex-shrink-0' : 'w-3.5 h-3.5 flex-shrink-0'} />
              <span className={mode === 'sidebar' ? 'min-w-0 flex-1 truncate' : undefined}>
                {itemLabel}
              </span>
            </Button>
          )
        })}
      </div>
    </nav>
  )
}
