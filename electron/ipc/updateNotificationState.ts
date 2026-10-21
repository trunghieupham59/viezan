import type { UpdateNotificationPreferences } from '../../shared/updateNotification'
import type { UpdateStatus } from '../../shared/updater'
import { DEFAULT_WINDOW_PALETTE, isThemeAccent, isThemePreset } from '../windowPalette'

export const NOTIFICATION_SNOOZE_MS = 24 * 60 * 60 * 1000
export interface NotificationState extends UpdateNotificationPreferences {
  snoozes: Record<string, number>
}

export function readNotificationState(value: unknown): NotificationState {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<NotificationState>
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
    locale: raw.locale === 'vi' || raw.locale === 'ja' ? raw.locale : 'en',
    theme: raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : 'system',
    themePreset: isThemePreset(raw.themePreset) ? raw.themePreset : DEFAULT_WINDOW_PALETTE,
    themeAccent: isThemeAccent(raw.themeAccent) ? raw.themeAccent : 'auto',
    snoozes: Object.fromEntries(Object.entries(raw.snoozes && typeof raw.snoozes === 'object' ? raw.snoozes : {})
      .filter(([version, until]) => version.length <= 128 && typeof until === 'number' && Number.isFinite(until) && until > Date.now())),
  }
}

export function isNotificationStatus(status: UpdateStatus): boolean {
  return !!status.version && (status.type === 'available' || status.type === 'downloading' || status.type === 'downloaded')
}
