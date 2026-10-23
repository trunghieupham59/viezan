import type { ComponentType, SVGProps } from 'react'
import type { ModuleDefinition, ModuleId } from '../../shared/modules'
import { BookIcon, ChatBubbleIcon, MicrophoneIcon, TranslateIcon } from '../components/ui/icons'

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
    labelKey: 'nav_chat',
    descriptionKey: 'command_palette_chat_description',
    icon: ChatBubbleIcon,
    keywords: ['chat', 'ai', 'message', 'conversation'],
    loadingLayout: 'blank',
  },
  {
    id: 'translate',
    labelKey: 'nav_translate',
    descriptionKey: 'command_palette_translate_description',
    icon: TranslateIcon,
    keywords: ['translate', 'translation', 'language', 'text', 'image', 'voice'],
    loadingLayout: 'blank',
    navigateEffect: 'clearTranslation',
  },
  {
    id: 'live',
    labelKey: 'nav_live_translate',
    descriptionKey: 'command_palette_live_description',
    icon: MicrophoneIcon,
    keywords: ['live', 'speech', 'microphone', 'real-time', 'subtitle'],
    loadingLayout: 'split',
  },
  {
    id: 'dictionary',
    labelKey: 'nav_dictionary',
    descriptionKey: 'command_palette_dictionary_description',
    loadingLabelKey: 'dictionary_title',
    icon: BookIcon,
    keywords: ['dictionary', 'lookup', 'word', 'definition', 'meaning'],
    loadingLayout: 'split',
  },
]

const MODULES_BY_ID: ReadonlyMap<ModuleId, CatalogModule> = new Map(APP_MODULES.map((module) => [module.id, module]))

/** The catalog entry for a module id. Every `ModuleId` is listed, so this never returns undefined for one. */
export function getModule(id: ModuleId): CatalogModule {
  const module = MODULES_BY_ID.get(id)
  if (!module) throw new Error(`Unknown module: ${id}`)
  return module
}

export function isModuleId(value: unknown): value is ModuleId {
  return typeof value === 'string' && MODULES_BY_ID.has(value as ModuleId)
}
