import { Button } from '../../ui/atoms'
import { DialogShell } from '../../ui/molecules'

export interface ThermalFanDisclaimerProps {
  title: string
  body: string
  acceptLabel: string
  cancelLabel: string
  closeLabel: string
  onAccept: () => void
  onCancel: () => void
}

/** First-run explanation and disclaimer shown before the privileged helper is started. */
export function ThermalFanDisclaimer({ title, body, acceptLabel, cancelLabel, closeLabel, onAccept, onCancel }: ThermalFanDisclaimerProps) {
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
      <p className="thermal-fan-disclaimer__body">{body}</p>
    </DialogShell>
  )
}
