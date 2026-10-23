/**
 * Feature modules — the product units Viezan is built from.
 *
 * A module owns a page in the workspace, its navigation entry, its Command Palette
 * command and (later) its Settings sections, Launcher commands, hotkeys and IPC. The
 * renderer catalog in `src/modules/catalog.ts` lists them; everything that renders
 * navigation reads that catalog instead of hard-coding the four pages.
 */

/** Stable identifiers; also the `AppPage` values the store persists. */
export type ModuleId = 'chat' | 'translate' | 'live' | 'dictionary'

/** How the workspace looks while a module's page chunk is still loading. */
export type ModuleLoadingLayout = 'blank' | 'split'

/** A side effect some modules run when the user navigates to them. */
export type ModuleNavigateEffect = 'clearTranslation'

/**
 * Metadata every module declares. Keys into the i18n table are kept as names so
 * the catalog stays free of React and of the translation runtime.
 */
export interface ModuleDefinition {
  id: ModuleId
  /** i18n key of the navigation label. */
  labelKey: 'nav_chat' | 'nav_translate' | 'nav_live_translate' | 'nav_dictionary'
  /** i18n key of the one-line description shown in the Command Palette. */
  descriptionKey:
    | 'command_palette_chat_description'
    | 'command_palette_translate_description'
    | 'command_palette_live_description'
    | 'command_palette_dictionary_description'
  /** i18n key used by the loading placeholder; defaults to `labelKey`. */
  loadingLabelKey?: 'dictionary_title'
  /** Search words for the Command Palette, in addition to the label. */
  keywords: readonly string[]
  loadingLayout: ModuleLoadingLayout
  navigateEffect?: ModuleNavigateEffect
}
