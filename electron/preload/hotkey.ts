/**
 * Global hotkey preload API — Quick Translate (translate the selection in any app)
 * and the Launcher shortcut. Shape: `shared/hotkeyApi.d.ts`; channels:
 * `electron/ipc/channels.ts`.
 */
import type { HotkeyApi } from '../../shared/hotkeyApi'
import { HOTKEY_CHANNELS } from '../ipc/channels'
import { invoke, subscribe, subscribeSignal } from './contract'

const { invoke: ch, event } = HOTKEY_CHANNELS

export const hotkeyApi: HotkeyApi = {
  update: invoke(ch.update),
  get: invoke(ch.get),
  disable: invoke(ch.disable),
  onTranslating: subscribe(event.translating),
  onTranslated: subscribe(event.translated),
  onError: subscribe(event.error),
  chat: {
    update: invoke(ch.chatUpdate),
    get: invoke(ch.chatGet),
    systemConflict: invoke(ch.chatSystemConflict),
    spotlight: {
      get: invoke(ch.spotlightGet),
      resolve: invoke(ch.spotlightResolve),
      restore: invoke(ch.spotlightRestore),
    },
    onOpen: subscribeSignal(event.chatOpen),
  },
}

export const hotkeySection = { hotkey: hotkeyApi }
