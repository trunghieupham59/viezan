import { type ElementType, type KeyboardEvent, useRef } from 'react'
import { Button, Input } from '../ui/atoms'
import { SearchIcon, XIcon } from '../ui/icons'

export interface HistoryNavigationItem<Id extends string = string> {
  id: Id
  label: string
  count: number
  Icon: ElementType<{ className?: string }>
}

export interface HistoryNavigationProps<Id extends string = string> {
  tabs: HistoryNavigationItem<Id>[]
  activeId: Id
  query: string
  label: string
  title: string
  subtitle: string
  searchPlaceholder: string
  clearSearchLabel: string
  onTabChange: (id: Id) => void
  onQueryChange: (query: string) => void
}

/** Search and keyboard-operable tab navigation for persisted feature history. */
export function HistoryNavigation<Id extends string>({
  tabs,
  activeId,
  query,
  label,
  title,
  subtitle,
  searchPlaceholder,
  clearSearchLabel,
  onTabChange,
  onQueryChange,
}: HistoryNavigationProps<Id>) {
  const searchRef = useRef<HTMLInputElement>(null)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const lastIndex = tabs.length - 1
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = index === lastIndex ? 0 : index + 1
    if (event.key === 'ArrowLeft') nextIndex = index === 0 ? lastIndex : index - 1
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = lastIndex
    if (nextIndex === null) return

    event.preventDefault()
    const nextTab = tabs[nextIndex]
    onTabChange(nextTab.id)
    tabRefs.current[nextIndex]?.focus()
  }

  return (
    <>
      <header className="page-section-header flex-wrap gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="reliability-page-title text-base font-bold">{title}</h1>
          <p className="reliability-page-subtitle mt-0.5 text-xs">{subtitle}</p>
        </div>
        <div className="history-search-control">
          <SearchIcon className="history-search-icon" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="history-search-input"
          />
          {query && (
            <Button
              size="xs"
              shape="icon"
              variant="neutral"
              appearance="ghost"
              onClick={() => {
                onQueryChange('')
                searchRef.current?.focus()
              }}
              className="history-search-clear"
              aria-label={clearSearchLabel}
              title={clearSearchLabel}
            >
              <XIcon className="h-3 w-3" />
            </Button>
          )}
        </div>
      </header>

      <div className="history-tabs" role="tablist" aria-label={label}>
        {tabs.map(({ id, label: tabLabel, count, Icon }, index) => {
          const active = activeId === id
          return (
            <Button
              key={id}
              ref={(node) => { tabRefs.current[index] = node }}
              size="md"
              shape="rect"
              variant={active ? 'primary' : 'neutral'}
              appearance={active ? 'soft' : 'ghost'}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onTabChange(id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className="history-tab"
            >
              <Icon className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate text-sm">{tabLabel}</span>
              <span className="history-tab-count" data-active={active || undefined}>{count}</span>
            </Button>
          )
        })}
      </div>
    </>
  )
}
