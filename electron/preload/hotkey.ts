/**
 * Global hotkey preload API — register/update/listen for the clipboard-translate hotkey
 * and the AI Chat quick-ask hotkey.
 */
import { ipcRenderer } from 'electron'

export const hotkeySection = {
  hotkey: {
    /**
     * Update (and re-register) global hotkey settings.
     * Pass `enabled: true` + `hotkey: 'CommandOrControl+Shift+T'` to activate.
     */
    update: (settings: {
      hotkey?: string
      enabled?: boolean
      provider?: string
      model?: string
      sourceLang?: string
      targetLang?: string
      uiLanguage?: 'vi' | 'en' | 'ja'
    }) => ipcRenderer.invoke('hotkey:update', settings),

    /** Get the currently persisted hotkey settings. */
    get: () => ipcRenderer.invoke('hotkey:get'),

    /** Disable the hotkey without clearing other settings. */
    disable: () => ipcRenderer.invoke('hotkey:disable'),

    /**
     * Listen for hotkey events pushed from the main process.
     * Returns a cleanup function — call it to unsubscribe.
     */
    onTranslating: (cb: (data: { text: string }) => void) => {
      const handler = (_: unknown, data: { text: string }) => cb(data)
      ipcRenderer.on('hotkey:translating', handler)
      return () => ipcRenderer.removeListener('hotkey:translating', handler)
    },
    onTranslated: (cb: (data: { original: string; translated: string }) => void) => {
      const handler = (_: unknown, data: { original: string; translated: string }) => cb(data)
      ipcRenderer.on('hotkey:translated', handler)
      return () => ipcRenderer.removeListener('hotkey:translated', handler)
    },
    onError: (cb: (data: { error: string }) => void) => {
      const handler = (_: unknown, data: { error: string }) => cb(data)
      ipcRenderer.on('hotkey:error', handler)
      return () => ipcRenderer.removeListener('hotkey:error', handler)
    },

    /** AI Chat hotkey — toggles the quick-ask popup. */
    chat: {
      /** Update (and re-register) AI Chat hotkey settings. */
      update: (settings: { hotkey?: string; enabled?: boolean }) =>
        ipcRenderer.invoke('hotkey:chat:update', settings),

      /** Get the currently persisted AI Chat hotkey settings. */
      get: () => ipcRenderer.invoke('hotkey:chat:get'),

      /**
       * Listen for the chat-open event pushed from the main process.
       * Returns a cleanup function — call it to unsubscribe.
       */
      onOpen: (cb: () => void) => {
        const handler = () => cb()
        ipcRenderer.on('hotkey:chat-open', handler)
        return () => ipcRenderer.removeListener('hotkey:chat-open', handler)
      },
    },
  },
}
