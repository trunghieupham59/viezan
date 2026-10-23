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
      /** Primary language of the auto-swap pair. */
      targetLang?: string
      /** Secondary language of the pair; '' turns the pair off. */
      secondaryLang?: string
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
    onTranslating: (cb: (data: { text: string; targetLang: string | null }) => void) => {
      const handler = (_: unknown, data: { text: string; targetLang: string | null }) => cb(data)
      ipcRenderer.on('hotkey:translating', handler)
      return () => ipcRenderer.removeListener('hotkey:translating', handler)
    },
    onTranslated: (cb: (data: { original: string; translated: string; targetLang: string | null }) => void) => {
      const handler = (_: unknown, data: { original: string; translated: string; targetLang: string | null }) => cb(data)
      ipcRenderer.on('hotkey:translated', handler)
      return () => ipcRenderer.removeListener('hotkey:translated', handler)
    },
    onError: (cb: (data: { error: string; errorCode?: string }) => void) => {
      const handler = (_: unknown, data: { error: string; errorCode?: string }) => cb(data)
      ipcRenderer.on('hotkey:error', handler)
      return () => ipcRenderer.removeListener('hotkey:error', handler)
    },

    /** macOS Accessibility permission, required to send the copy/paste keystrokes. */
    accessibility: {
      /** `required` is false where no permission exists; `granted` is then always true. */
      get: () => ipcRenderer.invoke('hotkey:accessibility:get'),
      /** Show the macOS prompt and, while still denied, open the Accessibility settings pane. */
      request: () => ipcRenderer.invoke('hotkey:accessibility:request'),
    },

    /** AI Chat hotkey — toggles the quick-ask popup. */
    chat: {
      /** Update (and re-register) AI Chat hotkey settings. */
      update: (settings: { hotkey?: string; enabled?: boolean }) =>
        ipcRenderer.invoke('hotkey:chat:update', settings),

      /** Get the currently persisted AI Chat hotkey settings. */
      get: () => ipcRenderer.invoke('hotkey:chat:get'),

      /**
       * macOS only: whether the system (Spotlight, Finder search) owns the Launcher shortcut.
       * Without `accelerator` the saved shortcut is checked.
       */
      systemConflict: (accelerator?: string) => ipcRenderer.invoke('hotkey:chat:systemConflict', accelerator),

      /** macOS first-run hand-over of Command+Space from Spotlight to the Launcher. */
      spotlight: {
        /** Whether to show the one-time prompt, and whether Viezan turned Spotlight's shortcut off. */
        get: () => ipcRenderer.invoke('hotkey:chat:spotlight:get'),
        /** `replace` turns Spotlight's shortcut off and enables Command+Space; `keep` enables Option+Space. */
        resolve: (choice: 'replace' | 'keep') => ipcRenderer.invoke('hotkey:chat:spotlight:resolve', choice),
        /** Turn Spotlight's shortcut back on. */
        restore: () => ipcRenderer.invoke('hotkey:chat:spotlight:restore'),
      },

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
