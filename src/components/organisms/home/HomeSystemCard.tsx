import { type ReactNode, useMemo } from 'react'
import { useBackgroundStatus } from '../../../hooks/useBackgroundStatus'
import { useThermalMonitor } from '../../../hooks/useThermalMonitor'
import { useAppStore, useT } from '../../../store/useAppStore'
import { fanDisplayName, fanProfileName } from '../../../utils/fanProfileText'
import { hottestSensor, thermalTone } from '../../../utils/thermalSensorRows'
import { tpl } from '../../../utils/tpl'
import { SectionCard, StatusChip } from '../../ui/molecules'

const TONE_TO_STATUS = { ok: 'ok', warm: 'warning', hot: 'danger' } as const

export interface HomeSystemCardProps {
  onOpen: () => void
}

/**
 * Home's machine summary: the hottest sensor, CPU load, each fan and the fan
 * profile in charge. Rendered only while the Thermal module is on, so sensors
 * are not read for a module the user turned off.
 */
export function HomeSystemCard({ onOpen }: HomeSystemCardProps) {
  const t = useT()
  const locale = useAppStore((state) => state.locale)
  const enabledModules = useAppStore((state) => state.enabledModules)
  const { support, snapshot } = useThermalMonitor()
  const { fans: fanStatus } = useBackgroundStatus(enabledModules)
  const integer = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }), [locale])

  const hottest = snapshot ? hottestSensor(snapshot.sensors) : null
  const unsupported = support !== null && !support.supported

  let body: ReactNode
  if (unsupported) {
    body = <p className="home-card-note">{t.home_system_unavailable}</p>
  } else if (!snapshot || !hottest) {
    body = <p className="home-card-note" aria-live="polite">{t.home_system_loading}</p>
  } else {
    const tone = thermalTone(hottest.celsius)
    body = (
      <>
        <div className="home-system-reading">
          <span className="home-system-temp" data-tone={tone}>{integer.format(hottest.celsius)}°</span>
          <span className="home-system-caption">
            <span>{t.thermal_hottest}</span>
            {snapshot.cpuLoadPercent !== undefined && <span>{tpl(t.home_system_load, { n: integer.format(snapshot.cpuLoadPercent) })}</span>}
          </span>
          {tone !== 'ok' && <StatusChip tone={TONE_TO_STATUS[tone]}>{tone === 'hot' ? t.home_system_hot : t.home_system_warm}</StatusChip>}
        </div>
        {snapshot.fans.length > 0 && (
          <dl className="home-system-fans">
            {snapshot.fans.map((fan) => (
              <div key={fan.id} className="home-system-fan">
                <dt>{fanDisplayName(t, fan)}</dt>
                <dd>{`${integer.format(fan.rpm)} RPM`}</dd>
              </div>
            ))}
          </dl>
        )}
        {fanStatus && (
          <p className="home-card-note">
            {fanStatus.profile ? tpl(t.home_system_profile, { name: fanProfileName(t, fanStatus.profile) }) : t.home_system_profile_custom}
          </p>
        )}
      </>
    )
  }

  return (
    <SectionCard title={t.home_system_title} actionLabel={t.home_open} onAction={onOpen} className="home-system-card">
      {body}
    </SectionCard>
  )
}
