import type { ThermalFan } from '../../../../shared/thermalApi'
import { ThermalReadingTile } from '../../ui/molecules'

export interface ThermalFanListProps {
  title: string
  fans: readonly ThermalFan[]
  history: Readonly<Record<string, readonly number[]>>
  nameFor: (fan: ThermalFan) => string
  rangeFor: (fan: ThermalFan) => string | undefined
  formatRpm: (rpm: number) => string
  emptyText: string
  historyLabel: string
}

/** Fan speeds with their min–max range as the level bar. */
export function ThermalFanList({ title, fans, history, nameFor, rangeFor, formatRpm, emptyText, historyLabel }: ThermalFanListProps) {
  return (
    <section className="thermal-group" aria-label={title}>
      <h2 className="thermal-group__title">{title}</h2>
      {fans.length === 0 ? (
        <p className="thermal-empty">{emptyText}</p>
      ) : (
        <div className="thermal-grid thermal-grid--fans">
          {fans.map((fan) => {
            const min = fan.minRpm ?? 0
            const max = fan.maxRpm ?? Math.max(fan.rpm, 1)
            const level = max > min ? (fan.rpm - min) / (max - min) : 0
            return (
              <ThermalReadingTile
                key={fan.id}
                label={nameFor(fan)}
                value={formatRpm(fan.rpm)}
                level={level}
                tone={level >= 0.85 ? 'hot' : level >= 0.6 ? 'warm' : 'ok'}
                history={history[fan.id]}
                historyLabel={`${nameFor(fan)} · ${historyLabel}`}
                detail={rangeFor(fan)}
              />
            )
          })}
        </div>
      )}
    </section>
  )
}
