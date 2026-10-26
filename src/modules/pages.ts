import { type ComponentType, lazy } from 'react'
import type { AppPageId } from '../../shared/modules'

/**
 * Page chunk per page (modules and system pages), kept apart from the catalog so
 * navigation organisms can read page metadata without pulling page code into their
 * import graph. Each entry is a lazy component; the chunk loads the first time its
 * page is shown.
 */
export const APP_PAGES: Readonly<Record<AppPageId, ComponentType>> = {
  home: lazy(() => import('../pages/HomePage').then((m) => ({ default: m.HomePage }))),
  chat: lazy(() => import('../pages/ChatPage').then((m) => ({ default: m.ChatPage }))),
  translate: lazy(() => import('../pages/TranslatePage').then((m) => ({ default: m.TranslatePage }))),
  live: lazy(() => import('../pages/LiveTranslatePage').then((m) => ({ default: m.LiveTranslatePage }))),
  dictionary: lazy(() => import('../pages/DictionaryPage').then((m) => ({ default: m.DictionaryPage }))),
  everywhere: lazy(() => import('../pages/EverywherePage').then((m) => ({ default: m.EverywherePage }))),
  apps: lazy(() => import('../pages/AppsPage').then((m) => ({ default: m.AppsPage }))),
  thermal: lazy(() => import('../pages/ThermalPage').then((m) => ({ default: m.ThermalPage }))),
  utilities: lazy(() => import('../pages/UtilitiesPage').then((m) => ({ default: m.UtilitiesPage }))),
  settings: lazy(() => import('../pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))),
}
