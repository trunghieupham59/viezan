import { Button } from './atoms'
import { CheckIcon, TrashIcon } from './icons'

interface HistoryBulkHeaderProps {
  countLabel: string
  totalCount: number
  selectedCount: number
  labelSelectAll: string
  labelSelected: string
  labelDeleteSelected: string
  onSelectAll: () => void
  onDeleteSelected: () => void
}

export function HistoryBulkHeader({
  countLabel,
  totalCount,
  selectedCount,
  labelSelectAll,
  labelSelected,
  labelDeleteSelected,
  onSelectAll,
  onDeleteSelected,
}: HistoryBulkHeaderProps) {
  const isAllSelected = totalCount > 0 && selectedCount === totalCount
  const isIndeterminate = selectedCount > 0 && selectedCount < totalCount

  return (
    <div className="flex-shrink-0 flex min-h-11 items-center justify-between gap-3 px-3
                    border-b border-gray-100 bg-white/95 dark:border-gray-800 dark:bg-neutral-900">
      <div className="min-w-0 flex items-center gap-3">
        <Button
          size="sm"
          shape="rect"
          variant="neutral"
          appearance="ghost"
          type="button"
          onClick={onSelectAll}
          disabled={totalCount === 0}
          aria-pressed={isIndeterminate ? 'mixed' : isAllSelected}
          className="-ml-1"
        >
          <span className={[
            'w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors',
            isAllSelected || isIndeterminate
              ? 'bg-gray-500 border-gray-500'
              : 'border-gray-300 dark:border-gray-600',
          ].join(' ')}>
            {isAllSelected && <CheckIcon className="w-2.5 h-2.5 text-white" />}
            {isIndeterminate && !isAllSelected && <span className="w-2 h-0.5 bg-white rounded-full block" />}
          </span>
          {labelSelectAll}
        </Button>

        <span className="truncate text-xs font-semibold text-gray-500 dark:text-gray-400">
          {selectedCount > 0 ? labelSelected : countLabel}
        </span>
      </div>

      <div className="flex-shrink-0 flex items-center gap-2">
        {selectedCount > 0 && (
          <Button
            size="sm"
            shape="rect"
            variant="danger"
            appearance="soft"
            type="button"
            onClick={onDeleteSelected}
          >
            <TrashIcon className="w-3.5 h-3.5" />
            {labelDeleteSelected}
          </Button>
        )}
      </div>
    </div>
  )
}
