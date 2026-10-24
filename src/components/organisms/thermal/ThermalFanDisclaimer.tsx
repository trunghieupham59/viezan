import { Button } from '../../ui/atoms'
import { AlertTriangleIcon, CheckIcon } from '../../ui/icons'
import { DialogShell } from '../../ui/molecules'

export interface ThermalFanDisclaimerProps {
  title: string
  /** One sentence on what is about to happen. */
  intro: string
  /** What the user can rely on (`ok`, a check each) or simply needs to know (`neutral`, a bullet each). */
  points: readonly string[]
  pointTone?: 'ok' | 'neutral'
  /** The risk that stays with the user, in a warning box. */
  warning?: string
  acceptLabel: string
  cancelLabel: string
  closeLabel: string
  onAccept: () => void
  onCancel: () => void
}

/** Confirmation before a fan action that needs the user's go-ahead (starting the helper, sensor detection). */
export function ThermalFanDisclaimer({ title, intro, points, pointTone = 'ok', warning, acceptLabel, cancelLabel, closeLabel, onAccept, onCancel }: ThermalFanDisclaimerProps) {
  return (
    <DialogShell
      label={title}
      title={title}
      closeLabel={closeLabel}
      onClose={onCancel}
      size="sm"
      footer={(
        <div className="thermal-fan-disclaimer__actions">
          <Button size="md" shape="rect" variant="neutral" appearance="outline" onClick={onCancel}>{cancelLabel}</Button>
          <Button size="md" shape="rect" variant="primary" appearance="solid" onClick={onAccept}>{acceptLabel}</Button>
        </div>
      )}
    >
      <div className="thermal-fan-disclaimer">
        <p className="thermal-fan-disclaimer__body">{intro}</p>
        <ul className="thermal-fan-disclaimer__points" data-tone={pointTone}>
          {points.map((point) => (
            <li key={point}>
              {pointTone === 'ok'
                ? <CheckIcon className="thermal-fan-disclaimer__mark" aria-hidden="true" />
                : <span className="thermal-fan-disclaimer__bullet" aria-hidden="true" />}
              <span>{point}</span>
            </li>
          ))}
        </ul>
        {warning && (
          <p className="thermal-fan-disclaimer__warning">
            <AlertTriangleIcon className="thermal-fan-disclaimer__mark" aria-hidden="true" />
            <span>{warning}</span>
          </p>
        )}
      </div>
    </DialogShell>
  )
}
