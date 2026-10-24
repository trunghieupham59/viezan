import type { FanProfile } from '../../shared/thermalApi'
import type { Translations } from '../i18n'

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
