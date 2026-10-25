import { type ReactNode, useMemo } from 'react'
import { useBackgroundStatus } from '../../../hooks/useBackgroundStatus'
import { useThermalMonitor } from '../../../hooks/useThermalMonitor'
import { useAppStore, useT } from '../../../store/useAppStore'
import { fanDisplayName, fanProfileName } from '../../../utils/fanProfileText'
import { hottestSensor, thermalTone } from '../../../utils/thermalSensorRows'
import { tpl } from '../../../utils/tpl'
import { Button, Meter } from '../../ui/atoms'
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
  const { support, snapshot, error, retry } = useThermalMonitor()
  const { fans: fanStatus } = useBackgroundStatus(enabledModules)
  const integer = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }), [locale])

  const hottest = snapshot ? hottestSensor(snapshot.sensors) : null
  const unsupported = support !== null && !support.supported

  // Supported, answered, but nothing to show: say so instead of "reading…" forever.
  const noSensors = (support !== null && !support.supported && support.reason === 'no-sensors')
    || (support?.supported === true && snapshot !== null && snapshot.sensors.length === 0)

  let body: ReactNode
  if (noSensors) {
    body = <p className="home-card-note">{t.thermal_no_sensors}</p>
  } else if (unsupported) {
    body = <p className="home-card-note">{t.home_system_unavailable}</p>
  } else if (error && !hottest) {
    body = (
      <div className="home-system-error" role="alert">
        <p className="home-card-note">{t.thermal_error_title}: {error}</p>
        <Button size="xs" shape="rect" variant="neutral" appearance="outline" onClick={retry}>{t.thermal_retry}</Button>
      </div>
    )
  } else if (!snapshot || !hottest) {
    body = <p className="home-card-note" aria-live="polite">{t.home_system_loading}</p>
  } else {
    const tone = thermalTone(hottest.celsius)
    const caption = [t.thermal_hottest, snapshot.cpuLoadPercent !== undefined ? tpl(t.home_system_load, { n: integer.format(snapshot.cpuLoadPercent) }) : null].filter(Boolean).join(' · ')
    body = (
      <>
        <div className="home-system-reading">
          <span className="home-system-temp" data-tone={tone}>{integer.format(hottest.celsius)}°</span>
          <span className="home-system-caption">{caption}</span>
          {tone !== 'ok' && <StatusChip tone={TONE_TO_STATUS[tone]}>{tone === 'hot' ? t.home_system_hot : t.home_system_warm}</StatusChip>}
        </div>
        {snapshot.fans.length > 0 && (
          <ul className="home-system-fans">
            {snapshot.fans.map((fan) => {
              const name = fanDisplayName(t, fan)
              const rpm = `${integer.format(fan.rpm)} RPM`
              return (
                <li key={fan.id} className="home-system-fan">
                  <span className="home-system-fan__name">{name}</span>
                  <Meter value={fan.rpm} min={fan.minRpm ?? 0} max={fan.maxRpm ?? Math.max(fan.rpm, 1)} label={name} valueText={rpm} emphasis="action" className="home-system-fan__meter" />
                  <span className="home-system-fan__rpm">{rpm}</span>
                </li>
              )
            })}
          </ul>
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
