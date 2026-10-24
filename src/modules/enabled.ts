import type { AppPageId, ModuleEnabledState, PageModuleId } from '../../shared/modules'
import { APP_MODULES, type CatalogModule, isAppPage, isSystemPage } from './catalog'

/** Catalog entries whose module is on, in navigation order. */
export function enabledPageModules(enabled: ModuleEnabledState): CatalogModule[] {
  return APP_MODULES.filter((module) => enabled[module.id] !== false)
}

/**
 * The page to actually show for `page`: itself when it is a system page or an
 * enabled module, otherwise Home (a module that was turned off, or an id from an
 * older or newer build that this one does not know).
 */
export function resolveActivePage(page: AppPageId | string, enabled: ModuleEnabledState): AppPageId {
  if (!isAppPage(page)) return 'home'
  if (isSystemPage(page)) return page
  return enabled[page] !== false ? page : 'home'
}

/** True when `id` is the only page module still on, so turning it off would leave no workspace. */
export function isLastEnabledPageModule(id: PageModuleId, enabled: ModuleEnabledState): boolean {
  const remaining = enabledPageModules(enabled)
  return remaining.length === 1 && remaining[0].id === id
}
