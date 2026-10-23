import { type ComponentType, lazy } from 'react'
import type { PageModuleId } from '../../shared/modules'

/**
 * Page chunk per module, kept apart from the catalog so navigation organisms can
 * read module metadata without pulling page code into their import graph. Each
 * entry is a lazy component; the chunk loads the first time its page is shown.
 */
export const MODULE_PAGES: Readonly<Record<PageModuleId, ComponentType>> = {
  chat: lazy(() => import('../pages/ChatPage').then((m) => ({ default: m.ChatPage }))),
  translate: lazy(() => import('../pages/TranslatePage').then((m) => ({ default: m.TranslatePage }))),
  live: lazy(() => import('../pages/LiveTranslatePage').then((m) => ({ default: m.LiveTranslatePage }))),
  dictionary: lazy(() => import('../pages/DictionaryPage').then((m) => ({ default: m.DictionaryPage }))),
}
