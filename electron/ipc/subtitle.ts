import type { BrowserWindow, IpcMain, IpcMainEvent } from 'electron'
import { SUBTITLE_CHANNELS, TRANSLATE_CHANNELS } from './channels'
import { MAX_TRANSLATE_SOURCE_CHARS } from './ipcConstants'
import { invalidIpcInput, isSafeLanguageCode, parseProviderModel } from './ipcValidation'
import { isLocalProvider, LOCAL_AI_PLACEHOLDER_KEY } from './localAi'
import { isSenderWindow } from './senderGuard'
import { getStoredApiKey } from './storage'
import { streamTranslation } from './translate'
import { TRANSLATION_STYLES, type TranslationStyle } from './translateValidation'

const MAX_MODEL_ID_CHARS = 200
const MAX_SEG_ID_CHARS = 200

export function registerSubtitleHandlers(
  ipc: IpcMain,
  getSubtitleWindow: () => BrowserWindow | null,
  getMainWindow: () => BrowserWindow | null,
  createSubtitleWindow: () => void,
) {
  const sendToMain = (channel: string, ...args: unknown[]) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  }

  /** True only when the event came from the floating subtitle window itself. */
  const isFromSubtitleWindow = (event: IpcMainEvent): boolean => {
    const win = getSubtitleWindow()
    return !!win && !win.isDestroyed() && event.sender === win.webContents
  }

  /**
   * The main window is the only legitimate caller of the control channels
   * (show/hide/update/setStyle/setSourceText/setState and live-stream). Other
   * windows that share the privileged preload (Quick Chat) must not drive the
   * overlay or spend API quota through it.
   */
  const isFromMainWindow = (event: Pick<IpcMainEvent, 'sender'>): boolean => isSenderWindow(event, getMainWindow)

  /** Register a fire-and-forget forwarder subtitle window → main window. */
  const forwardFromSubtitle = (channel: string) => {
    ipc.on(channel, (event, ...args: unknown[]) => {
      if (!isFromSubtitleWindow(event)) return
      sendToMain(channel, ...args)
    })
  }

  ipc.handle(SUBTITLE_CHANNELS.invoke.show, (event) => {
    if (!isFromMainWindow(event)) return
    const win = getSubtitleWindow()
    if (!win || win.isDestroyed()) {
      createSubtitleWindow()
    } else {
      win.show()
    }
  })

  ipc.handle(SUBTITLE_CHANNELS.invoke.hide, (event) => {
    if (!isFromMainWindow(event)) return
    const win = getSubtitleWindow()
    if (win && !win.isDestroyed()) {
      win.close()
    }
  })

  ipc.handle(SUBTITLE_CHANNELS.invoke.update, (event, { text, isTranslating }: { text: string; isTranslating: boolean }) => {
    if (!isFromMainWindow(event)) return
    const win = getSubtitleWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('subtitle:text', { text, isTranslating })
    }
  })

  ipc.handle(SUBTITLE_CHANNELS.invoke.setStyle, (event, style: { textColor: string; fontSize: number; bgOpacity: number }) => {
    if (!isFromMainWindow(event)) return
    const win = getSubtitleWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('subtitle:style', style)
    }
  })

  // ── Source text (raw STT text shown above translation) ─────────────────────
  ipc.handle(SUBTITLE_CHANNELS.invoke.setSourceText, (event, { text, segId }: { text: string; segId?: string }) => {
    if (!isFromMainWindow(event)) return
    const win = getSubtitleWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('subtitle:sourceText', { text, segId })
    }
  })

  // ── State sync from main renderer → subtitle ─────────────────────────────
  ipc.handle(SUBTITLE_CHANNELS.invoke.setState, (event, state: {
    selectedProvider: string
    selectedModel: string
    isActive: boolean
    isTranscribing: boolean
    isTranslating: boolean
    availableModels: { id: string; name: string }[]
    audioMode: string
    targetLang: string
    locale?: string
  }) => {
    if (!isFromMainWindow(event)) return
    const win = getSubtitleWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('subtitle:state', state)
    }
  })

  // ── Actions FROM subtitle window → forward to main renderer ────────────────
  // These are fired by subtitle.html via ipcRenderer.send (fire-and-forget).
  // The main process forwards them to the main window so the React app can react.

  for (const channel of [
    SUBTITLE_CHANNELS.event.actionStart,
    SUBTITLE_CHANNELS.event.actionStop,
    SUBTITLE_CHANNELS.event.actionSetProvider,
    SUBTITLE_CHANNELS.event.actionSetModel,
    SUBTITLE_CHANNELS.event.actionSetAudioMode,
    SUBTITLE_CHANNELS.event.actionSetTargetLang,
    SUBTITLE_CHANNELS.event.actionUpdateStyle,
    SUBTITLE_CHANNELS.event.actionClear,
  ]) {
    forwardFromSubtitle(channel)
  }

  // Fired when the ✕ button inside subtitle.html is clicked. The window's
  // 'closed' event (main.ts) is the single place that notifies the main
  // window with `subtitle:closed`, so this handler only closes the window.
  ipc.on('subtitle:close', (event) => {
    if (!isFromSubtitleWindow(event)) return
    const win = getSubtitleWindow()
    if (win && !win.isDestroyed()) {
      win.close()
    }
  })

  // ── Streaming translation for subtitle window ─────────────────────────────
  /**
   * `translate:live-stream` — like `translate` but streams each AI token directly
   * to the subtitle window in real-time so the user sees text appear as the AI
   * generates it, rather than waiting for the full response.
   *
   * Protocol pushed to subtitleWindow:
   *   subtitle:stream:start  — clears the current subtitle text
   *   subtitle:stream:token  — appends one token ({ segId, token }); segId matches start/end
   *   subtitle:stream:end    — signals completion (hide cursor)
   *
   * Returns the complete translated text to the renderer (same shape as `translate`).
   */
  ipc.handle(TRANSLATE_CHANNELS.invoke.liveStream, async (event, rawParams: unknown) => {
    if (!isFromMainWindow(event)) return { success: false, error: 'Untrusted sender' }
    const parsed = parseProviderModel(rawParams, {
      payloadName: 'Live stream',
      maxModelChars: MAX_MODEL_ID_CHARS,
    })
    if (!parsed.ok) return parsed.response
    const { provider, model } = parsed.value
    const params = parsed.params

    if (typeof params.sourceText !== 'string') return invalidIpcInput('Source text is required')
    const sourceText = params.sourceText
    if (!sourceText.trim()) return { success: false, error: 'Source text is empty' }
    if (sourceText.length > MAX_TRANSLATE_SOURCE_CHARS) {
      return {
        success: false,
        error: `Source text exceeds maximum length (${MAX_TRANSLATE_SOURCE_CHARS} characters)`,
        errorCode: 'PAYLOAD_TOO_LARGE',
      }
    }
    if (!isSafeLanguageCode(params.sourceLang)) return invalidIpcInput('Invalid source language')
    if (!isSafeLanguageCode(params.targetLang)) return invalidIpcInput('Invalid target language')
    const { sourceLang, targetLang } = params

    let translationStyle: TranslationStyle = 'general'
    if (params.translationStyle !== undefined) {
      if (
        typeof params.translationStyle !== 'string'
        || !TRANSLATION_STYLES.includes(params.translationStyle as TranslationStyle)
      ) {
        return invalidIpcInput('Invalid translation style')
      }
      translationStyle = params.translationStyle as TranslationStyle
    }

    if (params.segId !== undefined && (typeof params.segId !== 'string' || params.segId.length > MAX_SEG_ID_CHARS)) {
      return invalidIpcInput('Invalid segment id')
    }
    const segId = params.segId

    const apiKey = isLocalProvider(provider) ? LOCAL_AI_PLACEHOLDER_KEY : getStoredApiKey(provider)
    if (!apiKey) return { success: false, error: `No API key for ${provider}`, errorCode: 'NO_API_KEY' }

    const sendToSubtitle = (channel: string, payload?: unknown) => {
      const win = getSubtitleWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send(channel, payload)
      }
    }

    sendToSubtitle('subtitle:stream:start', { segId })

    try {
      const fullText = await streamTranslation(
        provider, apiKey, model,
        sourceText, sourceLang, targetLang,
        translationStyle,
        (token) => sendToSubtitle('subtitle:stream:token', { segId, token })
      )
      sendToSubtitle('subtitle:stream:end', { segId })
      return { success: true, translatedText: fullText }
    } catch (error: unknown) {
      sendToSubtitle('subtitle:stream:end', { segId })
      const msg = error instanceof Error ? error.message : String(error)
      return { success: false, error: msg }
    }
  })
}
