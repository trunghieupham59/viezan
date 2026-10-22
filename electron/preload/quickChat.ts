/**
 * Quick chat preload API — bridges the Raycast-style quick chat window and
 * the main renderer without exposing Node primitives.
 */
import { ipcRenderer } from 'electron'
import type { CurrencyConversionRequest, LauncherApi, LauncherFeatureRequest, LauncherIcon } from '../../shared/launcher'
import type { QuickAiSession, QuickAiTurn } from '../../shared/quickAi'

export interface QuickChatSeedPayload {
  question: string
  response?: string
  history?: QuickAiTurn[]
  provider: string
  model: string
}

export const quickChatSection = {
  quickChat: {
    launcher: {
      listApps: () => ipcRenderer.invoke('launcher:list-apps'),
      getIcons: (ids: string[]) => ipcRenderer.invoke('launcher:get-icons', ids),
      onIcons: (callback: (icons: LauncherIcon[]) => void) => {
        const handler = (_: unknown, icons: LauncherIcon[]) => callback(icons)
        ipcRenderer.on('launcher:icons', handler)
        return () => ipcRenderer.removeListener('launcher:icons', handler)
      },
      openApp: (id: string) => ipcRenderer.invoke('launcher:open-app', id),
      searchWeb: (query: string) => ipcRenderer.invoke('launcher:search-web', query),
      convertCurrency: (request: CurrencyConversionRequest) => ipcRenderer.invoke('launcher:convert-currency', request),
      getCurrencyTarget: () => ipcRenderer.invoke('launcher:get-currency-target'),
      setCurrencyTarget: (code: string | null) => ipcRenderer.invoke('launcher:set-currency-target', code),
    } satisfies LauncherApi,
    session: {
      get: () => ipcRenderer.invoke('quick-chat:session:get'),
      save: (session: QuickAiSession) => ipcRenderer.invoke('quick-chat:session:save', session),
      clear: () => ipcRenderer.invoke('quick-chat:session:clear'),
    },
    setLayout: (layout: 'compact' | 'expanded', contentHeight?: number) => ipcRenderer.invoke('quick-chat:set-layout', layout, contentHeight),
    hide: () => ipcRenderer.invoke('quick-chat:hide'),
    openSettings: () => ipcRenderer.invoke('quick-chat:open-settings'),
    openInChat: (payload?: QuickChatSeedPayload) => ipcRenderer.invoke('quick-chat:open-in-chat', payload),
    openFeature: (payload: LauncherFeatureRequest) => ipcRenderer.invoke('quick-chat:open-feature', payload),
    recordUsage: (cost: unknown) => ipcRenderer.invoke('quick-chat:record-usage', cost),
    onUsage: (cb: (cost: unknown) => void) => {
      const handler = (_: unknown, cost: unknown) => cb(cost)
      ipcRenderer.on('quick-chat:usage', handler)
      return () => ipcRenderer.removeListener('quick-chat:usage', handler)
    },
    onShow: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('quick-chat:show', handler)
      return () => ipcRenderer.removeListener('quick-chat:show', handler)
    },
    onOpenSettings: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('quick-chat:open-settings', handler)
      return () => ipcRenderer.removeListener('quick-chat:open-settings', handler)
    },
    onOpenFeature: (cb: (payload: LauncherFeatureRequest) => void) => {
      const handler = (_: unknown, payload: LauncherFeatureRequest) => cb(payload)
      ipcRenderer.on('quick-chat:open-feature', handler)
      return () => ipcRenderer.removeListener('quick-chat:open-feature', handler)
    },
    onOpenInChat: (cb: (payload: QuickChatSeedPayload | null) => void) => {
      const handler = (_: unknown, payload: QuickChatSeedPayload | null) => cb(payload)
      ipcRenderer.on('quick-chat:open-in-main-chat', handler)
      return () => ipcRenderer.removeListener('quick-chat:open-in-main-chat', handler)
    },
  },
}
