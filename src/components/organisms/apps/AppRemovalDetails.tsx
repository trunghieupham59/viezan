import type { AppAction, AppRemovalPlan } from '../../../../shared/appsApi'
import { useAppStore, useT } from '../../../store/useAppStore'
import { Button } from '../../ui/atoms'

interface Props {
  plan: AppRemovalPlan
  selected: string[]
  action: AppAction
  busy: boolean
  onToggle: (id: string) => void
  onReveal: (id: string) => void
}
export function AppRemovalDetails({ plan, selected, action, busy, onToggle, onReveal }: Props) {
  const { apps: t } = useT()
  const locale = useAppStore(s => s.locale)
  const size = (bytes: number | null) => {
    if (bytes === null) return t.unknownSize
    const unit = bytes >= 1_000_000_000 ? 'gigabyte' : bytes >= 1_000_000 ? 'megabyte' : bytes >= 1000 ? 'kilobyte' : 'byte'
    const divisor = unit === 'gigabyte' ? 1_000_000_000 : unit === 'megabyte' ? 1_000_000 : unit === 'kilobyte' ? 1000 : 1
    return new Intl.NumberFormat(locale, { style: 'unit', unit, maximumFractionDigits: 1 }).format(bytes / divisor)
  }
  return (
    <div className="apps-items">
      {plan.items.map(item => (
        <div className="apps-item" key={item.id}>
          <label className="apps-item-choice">
            <input type="checkbox" checked={selected.includes(item.id)}
              disabled={busy || Boolean(item.blocked) || item.kind === 'bundle'}
              onChange={() => onToggle(item.id)} />
            <span className="apps-item-copy">
              <span className="apps-path">{item.path}</span>
              <span className="apps-meta">{size(item.bytes)} · {t.evidence[item.evidence]} · {item.blocked ? t.errors[item.blocked] : item.kind === 'preferences' ? t.preferences : item.kind === 'bundle' && action === 'reset' ? t.keepBundle : t.trash}</span>
            </span>
          </label>
          <Button size="sm" variant="neutral" appearance="ghost" disabled={busy} onClick={() => onReveal(item.id)}>{t.reveal}</Button>
        </div>
      ))}
    </div>
  )
}
