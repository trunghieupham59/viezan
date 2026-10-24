import { AlertTriangleIcon, CheckIcon, SpinnerIcon } from '../atoms'

export type ProgressStepStatus = 'done' | 'active' | 'pending' | 'error'

export interface ProgressStep {
  id: string
  label: string
  /** Short trailing detail, e.g. "12 sources" or "54%". */
  detail?: string
}

export interface ProgressStepsProps {
  /** Accessible name of the list, e.g. "Research progress". */
  label: string
  steps: readonly (ProgressStep & { status: ProgressStepStatus })[]
  /** Spoken status words, localised by the caller. */
  statusLabels: Record<ProgressStepStatus, string>
  className?: string
}

function StepMarker({ status }: { status: ProgressStepStatus }) {
  if (status === 'done') return <CheckIcon className="ui-steps__glyph" />
  if (status === 'active') return <SpinnerIcon className="ui-steps__glyph animate-spin" />
  if (status === 'error') return <AlertTriangleIcon className="ui-steps__glyph" />
  return null
}

/**
 * An ordered list of the steps of a long task (deep research, local AI install,
 * fan sensor detection): each step shows done, running, waiting or failed, with
 * an optional detail. The running step carries `aria-current="step"`.
 */
export function ProgressSteps({ label, steps, statusLabels, className = '' }: ProgressStepsProps) {
  return (
    <ol className={`ui-steps${className ? ` ${className}` : ''}`} aria-label={label}>
      {steps.map((step) => (
        <li key={step.id} className="ui-steps__item" data-status={step.status} aria-current={step.status === 'active' ? 'step' : undefined}>
          <span className="ui-steps__marker" aria-hidden="true"><StepMarker status={step.status} /></span>
          <span className="ui-steps__label">
            {step.label}
            <span className="sr-only">, {statusLabels[step.status]}</span>
          </span>
          {step.detail && <span className="ui-steps__detail">{step.detail}</span>}
        </li>
      ))}
    </ol>
  )
}
