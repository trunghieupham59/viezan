import { Sparkline } from './Sparkline'

export type ThermalReadingTone = 'ok' | 'warm' | 'hot'

export interface ThermalReadingTileProps {
  /** Human label (localized) or, when unknown, the raw code. */
  label: string
  /** Raw sensor code shown small under the label when it differs from the label. */
  code?: string
  /** Formatted value, e.g. "52.4°C" or "1 820 RPM". */
  value: string
  /** 0–1 fill of the level bar. */
  level: number
  tone?: ThermalReadingTone
  /** Recent values for the sparkline; omit to hide it. */
  history?: readonly number[]
  historyLabel?: string
  /** Secondary line under the bar, e.g. a fan's min–max range. */
  detail?: string
}

/** One sensor or fan: label, current value, level bar and a short history line. */
export function ThermalReadingTile({ label, code, value, level, tone = 'ok', history, historyLabel, detail }: ThermalReadingTileProps) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0))
  return (
    <div className="thermal-tile" data-tone={tone}>
      <div className="thermal-tile__head">
        <div className="thermal-tile__labels">
          <p className="thermal-tile__label">{label}</p>
          {code && code !== label && <p className="thermal-tile__code">{code}</p>}
        </div>
        <p className="thermal-tile__value">{value}</p>
      </div>
      <div className="thermal-tile__bar" aria-hidden="true">
        <span className="thermal-tile__bar-fill" style={{ inlineSize: `${Math.round(clamped * 100)}%` }} />
      </div>
      {history && history.length > 1 && <Sparkline values={history} label={historyLabel ?? label} className="thermal-tile__spark" />}
      {detail && <p className="thermal-tile__detail">{detail}</p>}
    </div>
  )
}
