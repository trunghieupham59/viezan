import type { TranslationComparisonStatus } from '../../../types'
import { AlertTriangleIcon, CheckIcon, ClockIcon, SpinnerIcon } from '../icons'

export interface ModelRunStatusProps {
  status: TranslationComparisonStatus
  label: string
  compact?: boolean
}

/** Model-scoped execution status shared by comparison tabs and result cards. */
export function ModelRunStatus({ status, label, compact = false }: ModelRunStatusProps) {
  return (
    <span
      className={`model-run-status model-run-status--${status}${compact ? ' model-run-status--compact' : ''}`}
      data-run-status={status}
    >
      {status === 'idle' && <ClockIcon aria-hidden="true" />}
      {status === 'loading' && <SpinnerIcon aria-hidden="true" />}
      {status === 'success' && <CheckIcon aria-hidden="true" />}
      {status === 'error' && <AlertTriangleIcon aria-hidden="true" />}
      <span>{label}</span>
    </span>
  )
}
