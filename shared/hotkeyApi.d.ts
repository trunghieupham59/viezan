/**
 * Hotkey module API — the single source for the shape of `window.api.hotkey`.
 *
 * The preload implementation (`electron/preload/hotkey.ts`), the renderer type
 * (`src/types/index.ts`) and the test / web-preview mocks are all typed against this
 * interface, so a method added or changed here fails to compile wherever it is not
 * followed. Channel names live beside the main handlers in `electron/ipc/channels.ts`.
 */

export type HotkeyUiLanguage = 'vi' | 'en' | 'ja'

/** Patch for the Quick Translate shortcut; `undefined` fields are left unchanged. */
export interface HotkeySettingsPatch {
  hotkey?: string
  enabled?: boolean
  provider?: string
  model?: string
  sourceLang?: string
  /** Primary language of the auto-swap pair. */
  targetLang?: string
  /** Secondary language of the pair; '' turns the pair off. */
  secondaryLang?: string
  /** UI language for the floating hotkey indicator strings. */
  uiLanguage?: HotkeyUiLanguage
}

export type HotkeyUpdateErrorCode = 'INVALID' | 'IN_USE' | 'CONFLICT' | (string & {})

export interface HotkeyUpdateResult {
  success: boolean
  settings?: Record<string, unknown>
  error?: string
  errorCode?: HotkeyUpdateErrorCode
}

export interface HotkeySettingsResult {
  success: boolean
  settings?: Record<string, unknown>
}

export interface HotkeyTranslatingEvent {
  text: string
  /** Target picked by the language pair, or null when the model decides. */
  targetLang: string | null
}

export interface HotkeyTranslatedEvent {
  original: string
  translated: string
  targetLang: string | null
}

export interface HotkeyErrorEvent {
  error: string
  /** Stable code (ACCESSIBILITY_DENIED, COPY_FAILED, ...) when the failure has one. */
  errorCode?: string
}

export type SystemShortcutOwner = 'spotlight' | 'finder-search' | 'system'

export interface SystemShortcutConflictResult {
  success: boolean
  hotkey?: string
  enabled?: boolean
  conflict?: { owner: SystemShortcutOwner; accelerator: string } | null
  error?: string
}

export interface SpotlightStateResult {
  success: boolean
  shouldPrompt?: boolean
  disabledByViezan?: boolean
  error?: string
}

export interface SpotlightChangeResult {
  success: boolean
  /** False when macOS only applies the change after the next login. */
  applied?: boolean
  settings?: Record<string, unknown>
  error?: string
  errorCode?: string
}

/** Returns the unsubscribe function. */
export type Unsubscribe = () => void

/** macOS first-run hand-over of Command+Space from Spotlight to the Launcher. */
export interface HotkeySpotlightApi {
  /** Whether to show the one-time prompt, and whether Viezan turned Spotlight's shortcut off. */
  get: () => Promise<SpotlightStateResult>
  /** `replace` turns Spotlight's shortcut off and enables Command+Space; `keep` enables Option+Space. */
  resolve: (choice: 'replace' | 'keep') => Promise<SpotlightChangeResult>
  /** Turn Spotlight's shortcut back on. */
  restore: () => Promise<SpotlightChangeResult>
}

/** Launcher (quick chat) shortcut. */
export interface HotkeyChatApi {
  update: (settings: { hotkey?: string; enabled?: boolean }) => Promise<HotkeyUpdateResult>
  get: () => Promise<HotkeySettingsResult>
  /** macOS only: a system shortcut (Spotlight, Finder search) that owns the Launcher hotkey; checks the saved one without `accelerator`. */
  systemConflict: (accelerator?: string) => Promise<SystemShortcutConflictResult>
  spotlight: HotkeySpotlightApi
  /** Fired when the Launcher shortcut opens the quick chat. */
  onOpen: (cb: () => void) => Unsubscribe
}

/** Quick Translate shortcut: translate the selection in any app and replace it in place. */
export interface HotkeyApi {
  update: (settings: HotkeySettingsPatch) => Promise<HotkeyUpdateResult>
  get: () => Promise<HotkeySettingsResult>
  /** Disable the shortcut without clearing the other settings. */
  disable: () => Promise<{ success: boolean }>
  onTranslating: (cb: (data: HotkeyTranslatingEvent) => void) => Unsubscribe
  onTranslated: (cb: (data: HotkeyTranslatedEvent) => void) => Unsubscribe
  onError: (cb: (data: HotkeyErrorEvent) => void) => Unsubscribe
  chat: HotkeyChatApi
}
