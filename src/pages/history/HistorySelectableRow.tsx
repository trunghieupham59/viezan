import type { ReactNode } from 'react'
import { Button } from '../../components/ui/atoms'
import { CheckIcon, ChevronDownIcon } from '../../components/ui/icons'

type HistoryRowTone = 'neutral' | 'muted'

const ROW_TONE_CLASSES: Record<HistoryRowTone, {
  selected: string
  idle: string
  checked: string
  unchecked: string
}> = {
  neutral: {
    selected: 'border-gray-200 bg-gray-50 dark:border-gray-900 dark:bg-gray-950/20',
    idle: 'border-gray-100 bg-white hover:border-gray-100 hover:bg-gray-50/30 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-950 dark:hover:bg-gray-800/50',
    checked: 'bg-gray-500 border-gray-500',
    unchecked: 'border-gray-300 dark:border-gray-600 hover:border-gray-400',
  },
  muted: {
    selected: 'border-gray-200 bg-gray-50 dark:border-gray-900 dark:bg-gray-950/20',
    idle: 'border-gray-100 bg-white hover:border-gray-100 hover:bg-gray-50/30 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-950 dark:hover:bg-gray-800/50',
    checked: 'bg-gray-500 border-gray-500',
    unchecked: 'border-gray-300 dark:border-gray-600 hover:border-gray-400',
  },
}

interface HistorySelectableRowProps {
  id: string
  isSelected: boolean
  isExpanded: boolean
  tone?: HistoryRowTone
  preview: ReactNode
  meta: ReactNode
  expandedContent: ReactNode
  onToggleSelect: (id: string) => void
  onToggleExpand: (id: string) => void
}

export function HistorySelectableRow({
  id,
  isSelected,
  isExpanded,
  tone = 'neutral',
  preview,
  meta,
  expandedContent,
  onToggleSelect,
  onToggleExpand,
}: HistorySelectableRowProps) {
  const classes = ROW_TONE_CLASSES[tone]

  return (
    <li
      className={[
        'group rounded-lg border transition-colors duration-150',
        isSelected ? classes.selected : classes.idle,
      ].join(' ')}
    >
      <div className="flex items-start gap-2.5 px-3 py-3">
        <Button
          size="xs"
          shape="icon"
          appearance="ghost"
          role="checkbox"
          aria-checked={isSelected}
          onClick={(event) => {
            event.stopPropagation()
            onToggleSelect(id)
          }}
          className="history-row-checkbox mt-0.5 flex-shrink-0"
        >
          <span className={[
            'w-4 h-4 rounded border-2 flex items-center justify-center transition-colors',
            isSelected ? classes.checked : classes.unchecked,
          ].join(' ')}>
            {isSelected && <CheckIcon className="w-2.5 h-2.5 text-white" />}
          </span>
        </Button>

        <button
          type="button"
          className="btn-row-action"
          aria-expanded={isExpanded}
          onClick={() => onToggleExpand(id)}
        >
          <div className="flex w-full items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {preview}
            </div>
            <ChevronDownIcon
              className={`flex-shrink-0 w-4 h-4 text-gray-300 dark:text-gray-600 transition-transform duration-200 mt-0.5 ${isExpanded ? 'rotate-180' : ''}`}
            />
          </div>
          <div className="flex w-full items-center gap-x-2 gap-y-1.5 flex-wrap">
            {meta}
          </div>
        </button>
      </div>

      {isExpanded && expandedContent}
    </li>
  )
}
