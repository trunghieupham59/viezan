import { type ReactNode, useId } from 'react'
import '../../../styles/molecules.css'

export interface SettingsRowIds {
  /** Give the row's control `aria-labelledby={labelId}`. */
  labelId: string
  /** And `aria-describedby={descriptionId}` when the row has a description. */
  descriptionId?: string
}

export interface SettingsRowProps {
  label: ReactNode
  description?: ReactNode
  /** The control(s) at the row end; a function receives the ids that name them. */
  children?: ReactNode | ((ids: SettingsRowIds) => ReactNode)
  /** `top` for rows whose control is taller than the text (lists, editors). */
  align?: 'center' | 'top'
  /** Content that needs the full width under the label (lists, forms). */
  below?: ReactNode
  className?: string
}

/** One settings row: label and description at the start, controls at the end. */
export function SettingsRow({ label, description, children, align = 'center', below, className = '' }: SettingsRowProps) {
  const labelId = useId()
  const descriptionId = useId()
  const ids: SettingsRowIds = { labelId, descriptionId: description ? descriptionId : undefined }
  const controls = typeof children === 'function' ? children(ids) : children
  return (
    <div className={`ui-settings-row${className ? ` ${className}` : ''}`} data-align={align}>
      <div className="ui-settings-row__main">
        <div className="ui-settings-row__copy">
          <span id={labelId} className="ui-settings-row__label">{label}</span>
          {description && <span id={descriptionId} className="ui-settings-row__description">{description}</span>}
        </div>
        {controls && <div className="ui-settings-row__controls">{controls}</div>}
      </div>
      {below && <div className="ui-settings-row__below">{below}</div>}
    </div>
  )
}
