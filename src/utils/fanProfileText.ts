import type { FanProfile, ThermalFan } from '../../shared/thermalApi'
import type { Translations } from '../i18n'
import { tpl } from './tpl'

/** Built-in profile ids → their localized name / description keys. */
const BUILTIN_PROFILE_KEYS: Record<string, { name: keyof Translations; desc: keyof Translations }> = {
  'builtin:system': { name: 'thermal_fan_profile_builtin_system', desc: 'thermal_fan_profile_builtin_system_desc' },
  'builtin:quiet': { name: 'thermal_fan_profile_builtin_quiet', desc: 'thermal_fan_profile_builtin_quiet_desc' },
  'builtin:cool': { name: 'thermal_fan_profile_builtin_cool', desc: 'thermal_fan_profile_builtin_cool_desc' },
  'builtin:gaming': { name: 'thermal_fan_profile_builtin_gaming', desc: 'thermal_fan_profile_builtin_gaming_desc' },
  'builtin:local-ai': { name: 'thermal_fan_profile_builtin_local_ai', desc: 'thermal_fan_profile_builtin_local_ai_desc' },
}

function localized(t: Translations, key: keyof Translations | undefined): string | undefined {
  const value = key ? t[key] : undefined
  return typeof value === 'string' ? value : undefined
}

/** A fan profile's display name: the localized built-in name, else the user's own. */
export function fanProfileName(t: Translations, profile: Pick<FanProfile, 'id' | 'name'>): string {
  return localized(t, BUILTIN_PROFILE_KEYS[profile.id]?.name) ?? profile.name
}

/** A built-in profile's localized description; user profiles have none. */
export function fanProfileDescription(t: Translations, profile: Pick<FanProfile, 'id'>): string | undefined {
  return localized(t, BUILTIN_PROFILE_KEYS[profile.id]?.desc)
}

/** A fan's display name: what the machine says it is (left / right / CPU), else its driver name, else its number. */
export function fanDisplayName(t: Translations, fan: Pick<ThermalFan, 'index' | 'name' | 'label'>): string {
  const localizedLabel = fan.label ? localized(t, `thermal_fan_label_${fan.label}` as keyof Translations) : undefined
  return localizedLabel ?? fan.name ?? tpl(t.thermal_fan_name, { n: fan.index + 1 })
}
