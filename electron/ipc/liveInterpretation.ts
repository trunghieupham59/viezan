import type { BrowserWindow, IpcMain } from 'electron'
import type { LiveTranslationRequest } from '../../shared/liveInterpretation'
import { LiveInterpretationService } from '../services/LiveInterpretationService'
import { isRecord } from './ipcValidation'
import { LIVE_CONTEXT_CHARS, LIVE_SOURCE_CHARS } from './liveTranslationPolicy'
import { isLocalProvider, LOCAL_AI_PLACEHOLDER_KEY } from './localAi'
import { isSenderWindow } from './senderGuard'
import { getStoredApiKey } from './storage'
import { TRANSLATE_PROVIDERS } from './translateProviders'
import { parseTranslateParams } from './translateValidation'

const validId = (id: unknown): id is string => typeof id === 'string' && /^[\w-]{1,100}$/.test(id)

export function registerLiveInterpretationHandlers(ipc: IpcMain, getMainWindow: () => BrowserWindow | null, getSubtitleWindow: () => BrowserWindow | null) {
  const observedSenders = new WeakSet<object>()
  const service = new LiveInterpretationService(async (request, options) => {
    const key = isLocalProvider(request.provider) ? LOCAL_AI_PLACEHOLDER_KEY : getStoredApiKey(request.provider)
    if (!key) throw Object.assign(new Error('No provider credential'), { errorCode: 'NO_API_KEY' })
    return TRANSLATE_PROVIDERS[request.provider](key, request.model, request.sourceText, request.sourceLang, request.targetLang, false, 'general', false, 'off', 'low', options)
  })
  ipc.handle('live:begin', (event, sessionId: unknown) => {
    if (!isSenderWindow(event, getMainWindow) || !validId(sessionId)) return
    service.begin(sessionId)
    // Listener is idempotent per WebContents, and releases queued requests on a crash/close.
    if (!observedSenders.has(event.sender)) {
      observedSenders.add(event.sender)
      event.sender.once('destroyed', () => service.cancel())
    }
  })
  ipc.handle('live:cancel', (event, sessionId: unknown) => {
    if (isSenderWindow(event, getMainWindow) && validId(sessionId)) service.cancel(sessionId)
  })
  ipc.handle('live:translate', async (event, raw: unknown) => {
    if (!isSenderWindow(event, getMainWindow)) return { success: false, errorCode: 'PERMISSION_DENIED' }
    if (!isRecord(raw) || !validId(raw.sessionId) || !validId(raw.segmentId)
      || typeof raw.context !== 'string' || raw.context.length > LIVE_CONTEXT_CHARS
      || typeof raw.sourceText !== 'string' || !raw.sourceText.trim() || raw.sourceText.length > LIVE_SOURCE_CHARS
      || typeof raw.subtitles !== 'boolean' || !parseTranslateParams(raw).ok) {
      return { success: false, errorCode: 'INVALID_INPUT' }
    }
    const request = raw as unknown as LiveTranslationRequest
    const revision = service.getRevision()
    const result = await service.translate(request)
    // Only validated complete translations are published. Raw provider tokens can contain reasoning.
    const subtitle = getSubtitleWindow()
    if (result.success && service.isActive(request.sessionId, revision) && request.subtitles && subtitle && !subtitle.isDestroyed()) {
      subtitle.webContents.send('subtitle:stream:start', { segId: request.segmentId })
      subtitle.webContents.send('subtitle:stream:token', { segId: request.segmentId, token: result.translatedText })
      subtitle.webContents.send('subtitle:stream:end', { segId: request.segmentId })
    }
    return result
  })
}
