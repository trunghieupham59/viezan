import type { ComponentType, SVGProps } from 'react'
import type { AppPageId, ModuleDefinition, ModuleEnabledState, ModuleLoadingLayout, ModuleSpace, PageModuleId, SystemPageId } from '../../shared/modules'
import { BookIcon, ChatBubbleIcon, GearIcon, GlobeIcon, HomeIcon, KeyboardIcon, LayersIcon, MicrophoneIcon, ThermometerIcon, TranslateIcon } from '../components/ui/icons'
import type { Translations } from '../i18n'

/**
 * The renderer's module catalog: metadata plus the icon component. Navigation
 * (primary sidebar, Command Palette) and the workspace fallback read this list;
 * page chunks are mapped separately in `./pages.ts` so organisms never import pages.
 *
 * Order here is the order in the primary navigation.
 */
export interface CatalogModule extends ModuleDefinition {
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

export const APP_MODULES: readonly CatalogModule[] = [
  {
    id: 'chat',
    space: 'ai',
    labelKey: 'nav_chat',
    descriptionKey: 'command_palette_chat_description',
    icon: ChatBubbleIcon,
    keywords: ['chat', 'ai', 'message', 'conversation'],
    loadingLayout: 'blank',
  },
  {
    id: 'translate',
    space: 'language',
    labelKey: 'nav_translate',
    descriptionKey: 'command_palette_translate_description',
    icon: TranslateIcon,
    keywords: ['translate', 'translation', 'language', 'text', 'image', 'voice'],
    loadingLayout: 'blank',
    navigateEffect: 'clearTranslation',
  },
  {
    id: 'live',
    space: 'language',
    labelKey: 'nav_live_translate',
    descriptionKey: 'command_palette_live_description',
    icon: MicrophoneIcon,
    keywords: ['live', 'speech', 'microphone', 'real-time', 'subtitle'],
    loadingLayout: 'split',
  },
  {
    id: 'dictionary',
    space: 'language',
    labelKey: 'nav_dictionary',
    descriptionKey: 'command_palette_dictionary_description',
    loadingLabelKey: 'dictionary_title',
    icon: BookIcon,
    keywords: ['dictionary', 'lookup', 'word', 'definition', 'meaning'],
    loadingLayout: 'split',
  },
  {
    id: 'apps', space: 'system', labelKey: 'nav_apps', descriptionKey: 'apps_description',
    icon: LayersIcon, keywords: ['apps', 'applications', 'uninstall', 'reset', 'gỡ'], loadingLayout: 'list',
  },
  {
    id: 'thermal',
    space: 'system',
    labelKey: 'nav_thermal',
    descriptionKey: 'command_palette_thermal_description',
    icon: ThermometerIcon,
    keywords: ['thermal', 'temperature', 'heat', 'fan', 'rpm', 'cpu', 'gpu', 'sensor'],
    loadingLayout: 'list',
  },
]

/** Sidebar group order and each group's i18n heading key. A group with no enabled page is not shown. */
export const NAVIGATION_SPACES: readonly { id: ModuleSpace; labelKey: 'nav_space_ai' | 'nav_space_language' | 'nav_space_system' | 'nav_space_tools' }[] = [
  { id: 'ai', labelKey: 'nav_space_ai' },
  { id: 'language', labelKey: 'nav_space_language' },
  { id: 'system', labelKey: 'nav_space_system' },
  { id: 'tools', labelKey: 'nav_space_tools' },
]

/** Modules grouped by navigation space, in catalog order within each group; empty groups are dropped. */
export function groupModulesBySpace<T extends { space: ModuleSpace | null }>(modules: readonly T[]): { space: ModuleSpace; labelKey: (typeof NAVIGATION_SPACES)[number]['labelKey']; modules: T[] }[] {
  return NAVIGATION_SPACES
    .map((group) => ({ space: group.id, labelKey: group.labelKey, modules: modules.filter((module) => module.space === group.id) }))
    .filter((group) => group.modules.length > 0)
}

/**
 * Any page the workspace can show, module or not: what navigation, the Command
 * Palette and the loading fallback need to know about it.
 */
export interface CatalogPage {
  id: AppPageId
  /** Navigation group; null for pages placed on their own (Home at the top, Settings at the bottom). */
  space: ModuleSpace | null
  labelKey: keyof Translations
  descriptionKey: keyof Translations
  loadingLabelKey?: keyof Translations
  icon: ComponentType<SVGProps<SVGSVGElement>>
  keywords: readonly string[]
  loadingLayout: ModuleLoadingLayout
  navigateEffect?: ModuleDefinition['navigateEffect']
  /** True for pages that are always present (not a toggleable module). */
  system: boolean
}

/** Pages that are not modules: always present, never toggled. */
export const SYSTEM_PAGES: readonly (CatalogPage & { id: SystemPageId })[] = [
  {
    id: 'home',
    space: null,
    labelKey: 'nav_home',
    descriptionKey: 'command_palette_home_description',
    icon: HomeIcon,
    keywords: ['home', 'start', 'overview', 'recent', 'continue'],
    loadingLayout: 'list',
    system: true,
  },
  {
    id: 'everywhere',
    space: 'language',
    labelKey: 'nav_everywhere',
    descriptionKey: 'command_palette_everywhere_description',
    icon: GlobeIcon,
    keywords: ['quick translate', 'selection', 'hotkey', 'chrome', 'extension', 'browser'],
    loadingLayout: 'list',
    system: true,
  },
  {
    id: 'utilities',
    space: 'tools',
    labelKey: 'nav_utilities',
    descriptionKey: 'command_palette_utilities_description',
    icon: KeyboardIcon,
    keywords: ['launcher', 'shortcut', 'hotkey', 'spotlight', 'keyboard'],
    loadingLayout: 'list',
    system: true,
  },
  {
    id: 'settings',
    space: null,
    labelKey: 'nav_settings',
    descriptionKey: 'command_palette_settings_description',
    icon: GearIcon,
    keywords: ['settings', 'preferences', 'api', 'key', 'config', 'appearance', 'theme', 'model'],
    loadingLayout: 'list',
    system: true,
  },
]

function moduleAsPage(module: CatalogModule): CatalogPage {
  return { ...module, system: false }
}

const PAGES_BY_ID: ReadonlyMap<AppPageId, CatalogPage> = new Map<AppPageId, CatalogPage>([
  ...APP_MODULES.map((module) => [module.id, moduleAsPage(module)] as const),
  ...SYSTEM_PAGES.map((page) => [page.id, page] as const),
])

/** The catalog entry for any page id. */
export function getPage(id: AppPageId): CatalogPage {
  const page = PAGES_BY_ID.get(id)
  if (!page) throw new Error(`Unknown page: ${id}`)
  return page
}

export function isAppPage(value: unknown): value is AppPageId {
  return typeof value === 'string' && PAGES_BY_ID.has(value as AppPageId)
}

export function isSystemPage(id: AppPageId): id is SystemPageId {
  return PAGES_BY_ID.get(id)?.system === true
}

/**
 * What the primary navigation and the Command Palette list, in order: Home, then
 * the grouped pages (enabled modules plus the system pages that belong to a space),
 * then Settings. A space with no page left is dropped.
 */
export function navigationPages(enabled: ModuleEnabledState): { home: CatalogPage; groups: ReturnType<typeof groupModulesBySpace<CatalogPage>>; settings: CatalogPage } {
  const modules = APP_MODULES.filter((module) => enabled[module.id] !== false).map(moduleAsPage)
  const grouped = SYSTEM_PAGES.filter((page) => page.space !== null)
  return {
    home: getPage('home'),
    groups: groupModulesBySpace<CatalogPage>([...modules, ...grouped] as (CatalogPage & { space: ModuleSpace })[]),
    settings: getPage('settings'),
  }
}

const MODULES_BY_ID: ReadonlyMap<PageModuleId, CatalogModule> = new Map(APP_MODULES.map((module) => [module.id, module]))

/** The catalog entry for a module id. Every `PageModuleId` is listed, so this never returns undefined for one. */
export function getModule(id: PageModuleId): CatalogModule {
  const module = MODULES_BY_ID.get(id)
  if (!module) throw new Error(`Unknown module: ${id}`)
  return module
}

export function isPageModuleId(value: unknown): value is PageModuleId {
  return typeof value === 'string' && MODULES_BY_ID.has(value as PageModuleId)
}
