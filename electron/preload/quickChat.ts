/**
 * Quick chat preload API — bridges the Raycast-style quick chat window and the main
 * renderer without exposing Node primitives. Shape: `shared/quickChatApi.d.ts`
 * (plus `LauncherApi` from `shared/launcher.d.ts`).
 */
import type { LauncherApi } from '../../shared/launcher'
import type { QuickChatApi } from '../../shared/quickChatApi'
import { LAUNCHER_CHANNELS, QUICK_CHAT_CHANNELS } from '../ipc/channels'
import { invoke, subscribe, subscribeSignal } from './contract'

export type { QuickChatSeedPayload } from '../../shared/quickChatApi'

const launcherApi: LauncherApi = {
  listApps: invoke(LAUNCHER_CHANNELS.invoke.listApps),
  getIcons: invoke(LAUNCHER_CHANNELS.invoke.getIcons),
  onIcons: subscribe(LAUNCHER_CHANNELS.event.icons),
  openApp: invoke(LAUNCHER_CHANNELS.invoke.openApp),
  searchWeb: invoke(LAUNCHER_CHANNELS.invoke.searchWeb),
  searchFiles: invoke(LAUNCHER_CHANNELS.invoke.searchFiles),
  openFile: invoke(LAUNCHER_CHANNELS.invoke.openFile),
  revealFile: invoke(LAUNCHER_CHANNELS.invoke.revealFile),
  convertCurrency: invoke(LAUNCHER_CHANNELS.invoke.convertCurrency),
  getCurrencyTarget: invoke(LAUNCHER_CHANNELS.invoke.getCurrencyTarget),
  setCurrencyTarget: invoke(LAUNCHER_CHANNELS.invoke.setCurrencyTarget),
}

const { invoke: ch, event } = QUICK_CHAT_CHANNELS

export const quickChatApi: QuickChatApi = {
  launcher: launcherApi,
  session: {
    get: invoke(ch.sessionGet),
    save: invoke(ch.sessionSave),
    clear: invoke(ch.sessionClear),
  },
  setLayout: invoke(ch.setLayout),
  hide: invoke(ch.hide),
  openSettings: invoke(ch.openSettings),
  openInChat: invoke(ch.openInChat),
  openFeature: invoke(ch.openFeature),
  recordUsage: invoke(ch.recordUsage),
  onUsage: subscribe(event.usage),
  onShow: subscribeSignal(event.show),
  onOpenSettings: subscribeSignal(event.openSettings),
  onOpenFeature: subscribe(event.openFeature),
  onOpenInChat: subscribe(event.openInMainChat),
}

export const quickChatSection = { quickChat: quickChatApi }
