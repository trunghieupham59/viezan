import type { ComponentType, SVGProps } from 'react'
import type { ModuleDefinition, ModuleSpace, PageModuleId } from '../../shared/modules'
import { BookIcon, ChatBubbleIcon, MicrophoneIcon, ThermometerIcon, TranslateIcon } from '../components/ui/icons'

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
export function groupModulesBySpace<T extends Pick<ModuleDefinition, 'space'>>(modules: readonly T[]): { space: ModuleSpace; labelKey: (typeof NAVIGATION_SPACES)[number]['labelKey']; modules: T[] }[] {
  return NAVIGATION_SPACES
    .map((group) => ({ space: group.id, labelKey: group.labelKey, modules: modules.filter((module) => module.space === group.id) }))
    .filter((group) => group.modules.length > 0)
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
