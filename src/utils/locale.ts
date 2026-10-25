/**
 * Locale utilities — single source of truth for supported locales
 * and system locale detection.
 *
 * Extracted from App.tsx and SettingsPage.tsx (was duplicated in both).
 */
import type { AppLocale } from '../i18n'

/** All locales the application supports. Add new entries here when adding a new UI language. */
export const SUPPORTED_LOCALES: AppLocale[] = ['en', 'vi', 'ja']

/**
 * Detect the best matching AppLocale from the browser/OS language setting.
 * Falls back to 'en' when the system language is not in SUPPORTED_LOCALES.
 */
export function detectSystemLocale(): AppLocale {
  const lang = (navigator.language || 'en').split('-')[0]
  return SUPPORTED_LOCALES.includes(lang as AppLocale) ? (lang as AppLocale) : 'en'
}

const NUMBER_FORMAT_TAGS: Record<AppLocale, string> = { en: 'en-US', vi: 'vi-VN', ja: 'ja-JP' }

/** Format a calendar date using the app's UI language, not the OS regional settings. */
export function formatDateForLocale(timestamp: number, locale: AppLocale): string {
  return new Date(timestamp).toLocaleDateString(NUMBER_FORMAT_TAGS[locale] ?? NUMBER_FORMAT_TAGS.en)
}

/** Format a number for display using the app's UI language, not the OS regional settings. */
export function formatNumberForLocale(value: number, locale: AppLocale): string {
  return value.toLocaleString(NUMBER_FORMAT_TAGS[locale] ?? NUMBER_FORMAT_TAGS.en)
}
