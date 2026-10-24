import { useId, useState } from 'react'
import type { ThermalSensorGroup } from '../../../../shared/thermalApi'
import type { ThermalSensorRow } from '../../../utils/thermalSensorRows'
import { THERMAL_GROUPS, thermalTone } from '../../../utils/thermalSensorRows'
import { ChevronDownIcon } from '../../ui/atoms'

export interface ThermalSensorTableLabels {
  groupTitle: Record<ThermalSensorGroup, string>
  /** Tooltip of a group heading; receives the group's title. */
  groupExpand: (group: string) => string
  groupCollapse: (group: string) => string
  /** Title of a row: its localized label, its driver name, or the "unidentified" wording. */
  rowTitle: (row: ThermalSensorRow) => string
  /** Caption under a folded row, e.g. "8 sensors · avg 47°C". */
  rowCaption: (row: ThermalSensorRow) => string
  expand: string
  collapse: string
  empty: string
}

export interface ThermalSensorTableProps {
  rows: Record<ThermalSensorGroup, ThermalSensorRow[]>
  labels: ThermalSensorTableLabels
  formatCelsius: (celsius: number) => string
  /** Groups that start folded (their hottest reading stays on the heading). */
  collapsedGroups?: readonly ThermalSensorGroup[]
}

interface RowProps {
  row: ThermalSensorRow
  labels: ThermalSensorTableLabels
  formatCelsius: (celsius: number) => string
}

function SensorRow({ row, labels, formatCelsius }: RowProps) {
  const [open, setOpen] = useState(false)
  const membersId = useId()
  const foldable = row.count > 1
  const title = labels.rowTitle(row)
  return (
    <li className="thermal-row" data-tone={thermalTone(row.max)} data-unlabeled={row.unlabeled || undefined}>
      {foldable ? (
        <button
          type="button"
          className="thermal-row__main thermal-row__main--button"
          aria-expanded={open}
          aria-controls={membersId}
          title={open ? labels.collapse : labels.expand}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="thermal-row__chevron" aria-hidden="true"><ChevronDownIcon /></span>
          <span className="thermal-row__text">
            <span className="thermal-row__title">{title}</span>
            <span className="thermal-row__caption">{labels.rowCaption(row)}</span>
          </span>
          <span className="thermal-row__value">{formatCelsius(row.max)}</span>
        </button>
      ) : (
        <div className="thermal-row__main">
          <span className="thermal-row__chevron thermal-row__chevron--none" aria-hidden="true" />
          <span className="thermal-row__text">
            <span className="thermal-row__title">{title}</span>
            <span className="thermal-row__caption thermal-row__caption--code">{row.sensors[0]?.code}</span>
          </span>
          <span className="thermal-row__value">{formatCelsius(row.max)}</span>
        </div>
      )}
      {foldable && open && (
        <ul id={membersId} className="thermal-row__members">
          {row.sensors.map((sensor) => (
            <li key={sensor.id} className="thermal-row__member" data-tone={thermalTone(sensor.celsius)}>
              <span className="thermal-row__member-code">{sensor.name ?? sensor.code}</span>
              <span className="thermal-row__member-value">{formatCelsius(sensor.celsius)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

interface GroupProps {
  group: ThermalSensorGroup
  rows: ThermalSensorRow[]
  labels: ThermalSensorTableLabels
  formatCelsius: (celsius: number) => string
  initiallyOpen: boolean
}

/** One group: a heading that folds its rows; folded, it keeps the group's hottest reading in view. */
function SensorGroup({ group, rows, labels, formatCelsius, initiallyOpen }: GroupProps) {
  const [open, setOpen] = useState(initiallyOpen)
  const listId = useId()
  const title = labels.groupTitle[group]
  const count = rows.reduce((sum, row) => sum + row.count, 0)
  const max = rows.reduce((hottest, row) => Math.max(hottest, row.max), Number.NEGATIVE_INFINITY)
  return (
    <section className="thermal-table__group" aria-label={title} data-open={open || undefined}>
      <h3 className="thermal-table__heading">
        <button
          type="button"
          className="thermal-table__toggle"
          aria-expanded={open}
          aria-controls={listId}
          title={open ? labels.groupCollapse(title) : labels.groupExpand(title)}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="thermal-table__chevron" aria-hidden="true"><ChevronDownIcon /></span>
          <span className="thermal-table__name">{title}</span>
          <span className="thermal-table__count">{count}</span>
          {!open && Number.isFinite(max) && (
            <span className="thermal-table__max" data-tone={thermalTone(max)}>{formatCelsius(max)}</span>
          )}
        </button>
      </h3>
      {open && (
        <ul id={listId} className="thermal-table__rows">
          {rows.map((row) => <SensorRow key={row.id} row={row} labels={labels} formatCelsius={formatCelsius} />)}
        </ul>
      )}
    </section>
  )
}

/**
 * Temperatures as a compact table: one row per meaning (performance cores, GPU,
 * battery, …) showing the hottest reading, foldable to the raw sensors behind it;
 * keys nobody could name sit in one collapsed row at the end of their group. Each
 * group folds too, so the long tail of "other" sensors can stay out of the way.
 */
export function ThermalSensorTable({ rows, labels, formatCelsius, collapsedGroups = [] }: ThermalSensorTableProps) {
  const groups = THERMAL_GROUPS.filter((group) => rows[group].length > 0)
  if (groups.length === 0) return <p className="thermal-empty">{labels.empty}</p>
  return (
    <div className="thermal-table">
      {groups.map((group) => (
        <SensorGroup key={group} group={group} rows={rows[group]} labels={labels} formatCelsius={formatCelsius} initiallyOpen={!collapsedGroups.includes(group)} />
      ))}
    </div>
  )
}
