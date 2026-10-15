import { contextBridge, ipcRenderer } from 'electron'

// Minimal preload for the floating subtitle overlay window.
// Exposes subtitleAPI to the subtitle.html page.
contextBridge.exposeInMainWorld('subtitleAPI', {
  /** Listen for full-text updates (non-streaming path) */
  onText: (callback: (data: { text: string; isTranslating: boolean }) => void) => {
    ipcRenderer.on('subtitle:text', (_event, data) => callback(data))
  },
  /** Listen for style/appearance changes */
  onStyle: (callback: (style: { textColor: string; fontSize: number; bgOpacity: number }) => void) => {
    ipcRenderer.on('subtitle:style', (_event, style) => callback(style))
  },

  // ── Streaming translation events ───────────────────────────────────────────
  /** Fired when a new streaming translation begins — carries segId to identify the entry */
  onStreamStart: (callback: (data: { segId?: string }) => void) => {
    ipcRenderer.on('subtitle:stream:start', (_event, data) => callback(data ?? {}))
  },
  /**
   * Fired for each token as the AI generates it. `segId` identifies the stream
   * the token belongs to (undefined for a legacy bare-string payload).
   */
  onStreamToken: (callback: (token: string, segId?: string) => void) => {
    ipcRenderer.on('subtitle:stream:token', (_event, payload: string | { token?: unknown; segId?: unknown }) => {
      if (typeof payload === 'string') {
        callback(payload)
        return
      }
      if (payload && typeof payload.token === 'string') {
        callback(payload.token, typeof payload.segId === 'string' ? payload.segId : undefined)
      }
    })
  },
  /** Fired when the streaming is complete — carries segId */
  onStreamEnd: (callback: (data: { segId?: string }) => void) => {
    ipcRenderer.on('subtitle:stream:end', (_event, data) => callback(data ?? {}))
  },

  // ── Source text (raw STT text, shown above translation) ───────────────────
  /** Fired when a new raw/source text segment arrives — carries segId for entry matching */
  onSourceText: (callback: (data: { text: string; segId?: string }) => void) => {
    ipcRenderer.on('subtitle:sourceText', (_event, data) => callback(data))
  },

  // ── State sync from main renderer ─────────────────────────────────────────
  /** Fired when session state changes in main renderer */
  onState: (callback: (state: {
    selectedProvider: string
    selectedModel: string
    isActive: boolean
    isTranscribing: boolean
    isTranslating: boolean
    availableModels: { id: string; name: string }[]
    audioMode: string
    targetLang: string
  }) => void) => {
    ipcRenderer.on('subtitle:state', (_event, state) => callback(state))
  },

  // ── Actions → send to main process (forwarded to main renderer) ───────────
  /** User clicked Start in subtitle window */
  emitStart: () => ipcRenderer.send('subtitle:action:start'),
  /** User clicked Stop in subtitle window */
  emitStop: () => ipcRenderer.send('subtitle:action:stop'),
  /** User changed provider in subtitle window */
  emitSetProvider: (provider: string) => ipcRenderer.send('subtitle:action:setProvider', provider),
  /** User changed model in subtitle window */
  emitSetModel: (model: string) => ipcRenderer.send('subtitle:action:setModel', model),
  /** User changed audio input mode in subtitle window */
  emitSetAudioMode: (mode: string) => ipcRenderer.send('subtitle:action:setAudioMode', mode),
  /** User changed target language in subtitle window */
  emitSetTargetLang: (lang: string) => ipcRenderer.send('subtitle:action:setTargetLang', lang),
  /** User changed style (color/opacity/fontSize) in subtitle window */
  emitStyleUpdate: (style: { textColor: string; fontSize: number; bgOpacity: number }) =>
    ipcRenderer.send('subtitle:action:updateStyle', style),

  /** User clicked "New session / Clear" in subtitle window */
  emitClear: () => ipcRenderer.send('subtitle:action:clear'),

  /** Tell the main process the user clicked the ✕ close button */
  close: () => ipcRenderer.send('subtitle:close'),
})
