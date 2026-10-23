export interface ThermalSummaryItem {
  id: string
  label: string
  value: string
  /** Smaller line under the value, e.g. which sensor is hottest. */
  caption?: string
}

export interface ThermalSummaryProps {
  items: readonly ThermalSummaryItem[]
}

/** Row of headline figures (CPU load, hottest sensor, sensor count). */
export function ThermalSummary({ items }: ThermalSummaryProps) {
  return (
    <dl className="thermal-summary">
      {items.map((item) => (
        <div key={item.id} className="thermal-summary__item">
          <dt className="ui-kicker">{item.label}</dt>
          <dd className="thermal-summary__value">{item.value}</dd>
          {item.caption && <dd className="thermal-summary__caption">{item.caption}</dd>}
        </div>
      ))}
    </dl>
  )
}
