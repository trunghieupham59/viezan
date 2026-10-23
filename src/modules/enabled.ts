import type { ModuleEnabledState, PageModuleId } from '../../shared/modules'
import { APP_MODULES, type CatalogModule } from './catalog'

/** Catalog entries whose module is on, in navigation order. */
export function enabledPageModules(enabled: ModuleEnabledState): CatalogModule[] {
  return APP_MODULES.filter((module) => enabled[module.id] !== false)
}

/**
 * The page to show when `page` belongs to a module that is off: the first enabled
 * page module, or `page` itself when every page module is off (the toggles never
 * allow that, but a stale `modules.json` could).
 */
export function resolveActivePage(page: PageModuleId, enabled: ModuleEnabledState): PageModuleId {
  if (enabled[page] !== false) return page
  return enabledPageModules(enabled)[0]?.id ?? page
}

/** True when `id` is the only page module still on, so turning it off would leave no workspace. */
export function isLastEnabledPageModule(id: PageModuleId, enabled: ModuleEnabledState): boolean {
  const remaining = enabledPageModules(enabled)
  return remaining.length === 1 && remaining[0].id === id
}
