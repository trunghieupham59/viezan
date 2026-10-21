import { type ElementType, useEffect, useRef } from 'react'
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
  const navRef = useRef<HTMLElement>(null)

  // The rendered aria-current marker changes when the active section changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: follow scroll-driven section selection
  useEffect(() => {
    if (mode !== 'tabs') return
    const nav = navRef.current
    if (!nav) return
    const revealActive = () => {
      const active = nav.querySelector<HTMLElement>('[aria-current="true"]')
      if (!active || nav.clientWidth === 0) return
      const viewport = nav.getBoundingClientRect()
      const item = active.getBoundingClientRect()
      if (item.left < viewport.left) nav.scrollLeft += item.left - viewport.left
      else if (item.right > viewport.right) nav.scrollLeft += item.right - viewport.right
    }
    revealActive()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(revealActive)
    observer.observe(nav)
    return () => observer.disconnect()
  }, [activeId, mode])

  return (
    <nav
      ref={navRef}
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
              {/* `truncate` clips overflow; the button's line-height: 1 would cut
                  Vietnamese diacritics and descenders, so restore a token line height. */}
              <span className={mode === 'sidebar'
                ? 'min-w-0 flex-1 truncate leading-[var(--vzn-line-normal)]'
                : undefined}>
                {itemLabel}
              </span>
            </Button>
          )
        })}
      </div>
    </nav>
  )
}
