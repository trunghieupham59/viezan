/**
 * Quick chat API — the Raycast-style Launcher / quick-ask window and its bridge to the
 * main renderer. Single source for `window.api.quickChat`; see `electron/preload/quickChat.ts`,
 * `electron/ipc/quickChat.ts` and `electron/ipc/launcher.ts`.
 *
 * `Cost` is the usage-cost record the renderer defines (`UsageCost`); the preload only
 * forwards it, so it is a type parameter rather than a copy of the renderer type.
 */
import type { LauncherApi, LauncherFeatureRequest } from './launcher'
import type { QuickAiSession, QuickAiTurn } from './quickAi'

/** A quick-ask exchange handed to the main chat ("Open in chat"). */
export interface QuickChatSeedPayload {
  question: string
  response?: string
  /** Earlier complete Quick AI turns, oldest first, carried into the main chat. */
  history?: QuickAiTurn[]
  provider: string
  model: string
}

export type QuickChatLayout = 'compact' | 'expanded'

export interface QuickChatSessionApi {
  get: () => Promise<{ success: boolean; session: QuickAiSession | null }>
  save: (session: QuickAiSession) => Promise<{ success: boolean; error?: string }>
  clear: () => Promise<{ success: boolean; error?: string }>
}

export interface QuickChatApi<Cost = unknown> {
  launcher: LauncherApi
  session: QuickChatSessionApi
  /** Resize the popup to its compact or expanded layout. */
  setLayout: (layout: QuickChatLayout, contentHeight?: number) => Promise<{ success: boolean }>
  hide: () => Promise<{ success: boolean; error?: string }>
  /** Ask the main window to open Settings (and hide the popup). */
  openSettings: () => Promise<{ success: boolean; error?: string }>
  /** Hand the current exchange to the main chat. */
  openInChat: (payload?: QuickChatSeedPayload) => Promise<{ success: boolean; error?: string }>
  /** Open a feature page in the main window (translate, dictionary, ...). */
  openFeature: (payload: LauncherFeatureRequest) => Promise<{ success: boolean; error?: string }>
  /** Report a usage cost from the popup; main relays it to the main window via `onUsage`. */
  recordUsage: (cost: Cost) => Promise<{ success: boolean; error?: string }>
  onUsage: (cb: (cost: Cost) => void) => () => void
  /** The popup was shown (focus the input, refresh state). */
  onShow: (cb: () => void) => () => void
  onOpenSettings: (cb: () => void) => () => void
  onOpenFeature: (cb: (payload: LauncherFeatureRequest) => void) => () => void
  onOpenInChat: (cb: (payload: QuickChatSeedPayload | null) => void) => () => void
}
