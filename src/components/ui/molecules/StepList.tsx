import type { ReactNode } from 'react'
import '../../../styles/molecules.css'

export interface StepItem {
  key: string
  title: ReactNode
  /** A line of help or the step's one action. */
  detail?: ReactNode
}

export interface StepListProps {
  label: string
  steps: readonly StepItem[]
}

/** Numbered steps side by side, each a soft tile: how a feature is used or set up. */
export function StepList({ label, steps }: StepListProps) {
  return (
    <ol className="ui-step-list" aria-label={label}>
      {steps.map((step, index) => (
        <li key={step.key} className="ui-step-list__item">
          <span className="ui-step-list__number" aria-hidden="true">{index + 1}</span>
          <span className="ui-step-list__title">{step.title}</span>
          {step.detail && <span className="ui-step-list__detail">{step.detail}</span>}
        </li>
      ))}
    </ol>
  )
}
